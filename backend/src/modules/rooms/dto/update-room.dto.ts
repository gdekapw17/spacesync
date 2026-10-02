import { PartialType } from '@nestjs/swagger';
import { CreateRoomDto } from './create-room.dto';

/**
 * Data Transfer Object for mutating existing room metadata and operational status.
 * Inherits all validation rules from CreateRoomDto as optional fields.
 */
export class UpdateRoomDto extends PartialType(CreateRoomDto) {}
