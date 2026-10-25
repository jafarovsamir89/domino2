import {Body,Controller,Get,HttpCode,HttpException,Param,Post,Req,Res} from '@nestjs/common';
import type {Request,Response} from 'express';
import {RewardedRequestAccess} from './request-access.js';

const publicErrors:Readonly<Record<string,number>>={
 rewarded_disabled:503,active_session_required:401,untrusted_origin:403,
 attempt_not_found:404,invalid_request:400,opt_in_required:400,
 normal_daily_required:409,frequency_cap:409,attempt_cap:409,active_attempt_scope_conflict:409
};

/** Candidate controller; only RewardedReviewModule.register() mounts these routes.
 * No client completion/grant endpoint: credit still requires a verified provider callback.
 */
@Controller('economy/daily-bonus/rewarded')
export class RewardedController {
 constructor(private readonly access:RewardedRequestAccess){}
 private async reply<T>(response:Response,operation:()=>Promise<T>):Promise<T>{
  response.setHeader('Cache-Control','no-store');
  try{return await operation();}
  catch(error){
   const message=error instanceof Error?error.message:'';
   const code=Object.hasOwn(publicErrors,message)?message:'rewarded_unavailable';
   // Never include SQL, configuration, tokens or raw exception messages in HTTP errors.
   throw new HttpException({error:code},publicErrors[code]??503);
  }
 }
 @Post('attempt')
 @HttpCode(200)
 issue(@Req() req:Request,@Body() body:unknown,@Res({passthrough:true}) response:Response){
  return this.reply(response,()=>this.access.issue(req.headers,body));
 }
 @Get('attempt/:attemptId')
 status(@Req() req:Request,@Param('attemptId') attemptId:string,@Res({passthrough:true}) response:Response){
  return this.reply(response,()=>this.access.status(req.headers,attemptId));
 }
 @Get('recovery')
 recover(@Req() req:Request,@Res({passthrough:true}) response:Response){
  return this.reply(response,()=>this.access.recover(req.headers));
 }
 @Post('cancel')
 @HttpCode(200)
 cancel(@Req() req:Request,@Body() body:unknown,@Res({passthrough:true}) response:Response){
  return this.reply(response,()=>this.access.cancel(req.headers,body));
 }
}
