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
  @IsUrl({ require_tld: false }, { message: "avatarUrl must be a valid URL" })
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

export class PurchaseTableSkinDto {
  @IsString()
  @MaxLength(64)
  key!: string;
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
}
