import {Friend} from "../core/friend";
import {Group} from "../core/group";
import {Client} from "../client";
import {lock} from "../common";
import {Sendable} from "./elements";

export interface Msg {
    from_user_name: Record<string, any> & { str: string }
    to_user_name: Record<string, any> & { str: string }
    content: Record<string, any> & { str: string }
    msg_type: '3' | '1' | '34' | '43'
    img_buf?: {
        len: string
        buffer?: string
    }
}

export class Message {
    public from: Friend | Group
    public to: Friend | Group
    message_type: 'group' | 'private'
    public message: Sendable

    constructor(public readonly c: Client, message: Msg) {
        this.from = message.from_user_name.str.endsWith('@chatroom') ? c.pickGroup(message.from_user_name.str) : c.pickFriend(message.from_user_name.str)
        this.to = message.to_user_name.str.endsWith('@chatroom') ? c.pickGroup(message.to_user_name.str) : c.pickFriend(message.from_user_name.str)
        this.message_type = message.from_user_name.str.endsWith('@chatroom') ? 'group' : 'private'
        switch (message.msg_type) {
            // 文本或表情
            case "1":
                this.message = message.content.str
                break;
            // 图片
            case "3":
                this.message = {
                    type: 'image',
                    image: Buffer.from(message.img_buf.buffer)
                }
                break;
            // 视频
            case '43':
                // this.message = {
                //     type: 'video',
                //     video: Buffer.from(message.img_buf.buffer)
                // }
                break;
            default:
                break;
        }
        this.message = message.content.str
        lock(this, 'c')
        c.emit(`message:${this.message_type}`, this)
        this.to.emit('message', this)
        c.emit('message', this)
    }

    reply(msg: Sendable) {
        return this.from.sendMsg(msg)
    }

    toString() {
        return this.message.toString()
    }
}
