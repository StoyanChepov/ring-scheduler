import { IsString, MaxLength } from 'class-validator';

export class DeleteAccountDto {
  // Asked again so a session left open on someone else's screen can't be used
  // to wipe the account.
  @IsString()
  @MaxLength(72)
  password: string;
}
