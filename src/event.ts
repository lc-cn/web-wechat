import {Message} from "./message";

export interface EventMap{
    'message'(message:Message):void
    'message.group'(message:Message):void
    'message.private'(message:Message):void
    'system.ready'():void
    'system.login'():void
}
