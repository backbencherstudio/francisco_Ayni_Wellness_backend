import { IsInt, Min, Max, IsArray, ArrayMaxSize, IsOptional, IsString, MaxLength } from 'class-validator';

export { EMOTION_KEYS } from '../emotion.config';

export class CreateMoodDto {
	@IsInt() @Min(1) @Max(10)
	score: number;

	@IsArray() @ArrayMaxSize(8)
	emotions: string[];

	@IsOptional() @IsString() @MaxLength(1000)
	note?: string;
}
