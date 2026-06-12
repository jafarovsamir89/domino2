import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";

export class UpdateProfileNameDto {
  @IsString()
  @MaxLength(32)
  name!: string;
}

export class UpdateProfileAvatarDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === null ? undefined : value))
  @IsString()
  @MaxLength(150000)
  avatarUrl?: string | null;
}

export class RealtimeHeartbeatDto {
  @IsString()
  @MaxLength(64)
  sessionId!: string;

  @IsString()
  @MaxLength(32)
  provider!: string;

  @IsString()
  @MaxLength(64)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  roomId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  roomCode?: string | null;

  @IsString()
  @MaxLength(32)
  gameMode!: string;

  @IsBoolean()
  isPlaying!: boolean;

  @IsBoolean()
  isConnected!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  roomMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  stakeKey?: string | null;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  stakeAmount?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  humanSeats?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  totalPlayers?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  aiCount?: number;

  @IsOptional()
  @IsBoolean()
  isTeamMode?: boolean;
}

export class SocialRequestFriendDto {
  @IsString()
  @MaxLength(64)
  playerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  note?: string;
}

export class SocialSendGiftDto {
  @IsString()
  @MaxLength(64)
  recipientPlayerId!: string;

  @IsString()
  @MaxLength(64)
  giftKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  contextType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  contextId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  note?: string;
}

export class SocialSendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  text?: string;
}

export class SocialExchangeGiftDto {
  @IsString()
  @MaxLength(64)
  giftKey!: string;

  @IsInt()
  @Min(1)
  @Max(9999)
  @Type(() => Number)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  note?: string;
}

export class RoomInviteDto {
  @IsString()
  @MaxLength(64)
  inviteePlayerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  roomCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  roomMode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  stakeKey?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  @Type(() => Number)
  stakeAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(16)
  @Type(() => Number)
  humanSeats?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(16)
  @Type(() => Number)
  totalPlayers?: number;

  @IsOptional()
  @IsBoolean()
  isTeamMode?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  note?: string;

  @IsOptional()
  @IsObject()
  payloadJson?: unknown;

  @IsOptional()
  @IsString()
  expiresAt?: string | null;
}

export class PlayInviteDto {
  @IsString()
  @MaxLength(64)
  inviteePlayerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  note?: string;

  @IsOptional()
  @IsObject()
  payloadJson?: unknown;

  @IsOptional()
  @IsString()
  expiresAt?: string | null;
}

export class PurchaseTableSkinDto {
  @IsString()
  @MaxLength(64)
  key!: string;
}

export class EconomyDailyBonusClaimDto {
  @IsOptional()
  @IsIn(["normal", "rewarded_x2"])
  claimMode?: "normal" | "rewarded_x2";
}

export class EconomyMatchParticipantDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  playerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  displayName?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  teamIndex?: number | null;
}

export class EconomyReserveMatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  roomId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  roomCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  matchId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  stakeKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceMatchId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  integrityScope?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  proof?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EconomyMatchParticipantDto)
  participants?: EconomyMatchParticipantDto[];
}

export class EconomySettleMatchDto extends EconomyReserveMatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(16)
  result?: "win" | "draw" | "refund" | string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  winnerPlayerIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  winnerUserIds?: string[];
}

export class EconomySoloReserveDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  matchId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  stakeKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  difficulty?: string | null;
}

export class EconomySoloSettleDto extends EconomySoloReserveDto {
  @IsOptional()
  @IsString()
  @MaxLength(16)
  result?: "win" | "draw" | "refund" | "loss" | string | null;
}

export class AdminWalletAdjustDto {
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  @Type(() => Number)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  note?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string | null;
}

export class AdminBanDto {
  @IsString()
  @MaxLength(256)
  reason!: string;

  @IsOptional()
  @IsString()
  expiresAt?: string | null;
}

export class AdminReportResolveDto {
  @IsOptional()
  @IsIn(["resolved", "rejected"])
  status?: "resolved" | "rejected";
}

export class MatchesParticipantDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  teamIndex?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  winnerKey?: string | null;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  points?: number | string | null;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  roundWins?: number | string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  result?: string | null;

  @IsOptional()
  @IsBoolean()
  isBot?: boolean;
}

export class PlatformMatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  mode?: string;

  @IsOptional()
  @IsBoolean()
  isTeamMode?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  roomId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  winnerKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  result?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  stakeKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceMatchId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  integrityScope?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  proof?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatchesParticipantDto)
  participants?: MatchesParticipantDto[];

  @IsOptional()
  @IsArray()
  teams?: Array<{ memberIds?: string[] }>;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  totalPoints?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  matchOutcome?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  forfeitUserIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  forfeitPlayerIds?: string[];
}

export class PlayInviteAttachRoomDto {
  @IsString()
  @MaxLength(64)
  roomId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  roomCode?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  inviteIds?: string[];

  @IsOptional()
  @IsObject()
  roomSettings?: Record<string, unknown> | null;
}

export class PlayInviteJoinDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  roomId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  roomCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  reason?: string | null;
}
