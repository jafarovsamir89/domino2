import {Module,type DynamicModule} from '@nestjs/common';
import {RewardedController} from './rewarded.controller.js';
import {RewardedRequestAccess} from './request-access.js';

/** Explicit local/review composition only. Not imported by the production AppModule.
 * Registration must receive an access boundary; it cannot construct credentials or enable it.
 */
@Module({})
export class RewardedReviewModule {
 static register(access:RewardedRequestAccess):DynamicModule{
  return {module:RewardedReviewModule,controllers:[RewardedController],providers:[{provide:RewardedRequestAccess,useValue:access}]};
 }
}
