import {MessageElem, Parser, Sendable} from "@/elements";
import {Client} from "@/client";
import {Dict} from "@/types";
import {convertEmoji, isRoomContact} from "@/utils";
import {OriginMessage} from "@/core/constanst";

export class Message {
    message_id: string
    raw_message: string = ''
    message: MessageElem[] = []
    create_time: number
    parser: Parser

    static genMsgId() {
        return Math.ceil(Date.now() * 1e3)
    }

    constructor(public c: Client, private original: Message.Original) {
        this.parser = new Parser(c)
        this.message_id = original.MsgId
        this.create_time = original.CreateTime
    }

    async parse() {
        await this.parser.parse(this.original)
        this.message = this.parser.message
        this.raw_message = this.parser.brief
    }

    async forward(user_id: string) {
        return isRoomContact(user_id) ?
            this.c.sendGroupMsg(user_id, this.message) :
            this.c.sendPrivateMsg(user_id, this.message)
    }

    [Symbol.unscopables]() {
        return {
            parser:true,
            c: true,
        }
    }
    toJSON(){
        return Object.fromEntries(Object.keys(this).filter((key) => {
            return typeof this[key as keyof this] !== "function" &&
                !['parser','c','group','friend','member','original'].includes(key)
        }).map(key => {
            return [key, this[key as keyof this]]
        }))
    }
    static from(this: Client, original: Message.Original) {
        return isRoomContact(original.FromUserName) ?
            new GroupMessageEvent(this, original) :
            new PrivateMessageEvent(this, original)
    }
}

export namespace Message {
    export interface Sender {
        user_id: string
        nickname: string
        card?: string
    }

    export interface Original {
        MsgId: string
        FromUserName: string
        ToUserName: string
        MsgType: OriginMessage
        Content: string
        Status: number
        ImgStatus: number
        CreateTime: number
        VoiceLength: number
        PlayLength: number
        FineName: string
        FileSize: string
        MediaId: string
        Url: string
        AppMsgType: number
        StatusNotifyCode: number
        StatusNotifyUserName: string
        RecommendInfo: Dict
        ForwardFlag: number
        AppInfo: Dict
        HasProductId: number
        Ticket: string
        ImgHeight: number
        ImgWidth: number
        SubMsgType: number
        NewMsgId: number
        OriContent: string
        EncryFileName: string
    }
}
export interface Message{
    toJSON():any
}

export interface MessageEvent {
    c: Client
    sender: Message.Sender
    post_type: 'message'
    message_type: 'group' | 'private'

    reply(message: Sendable): Promise<string | string[]>

    recall(message_id: string): Promise<boolean>
}

export class PrivateMessageEvent extends Message implements MessageEvent {
    post_type = 'message' as const
    message_type = 'private' as const

    get user_id() {
        return this.sender.user_id
    }

    is_self: boolean
    sender: Message.Sender

    constructor(public c: Client, original: Message.Original) {
        super(c, original);
        this.is_self = original.FromUserName === this.c.info.username
        try {
            this.sender = {
                user_id: original.FromUserName,
                nickname: convertEmoji(this.is_self ? this.c.info.nickname : this.c.pickFriend(original.FromUserName)?.info.nickname)
            }
        } catch (e) {
            console.log(original, this.c.fl)
            throw e
        }
    }

    reply(message: Sendable) {
        return this.c.sendPrivateMsg(this.user_id, message)
    }
    recall(): Promise<boolean> {
        return this.c.recallMsg(this.user_id, this.message_id)
    }
}

export class GroupMessageEvent extends Message implements MessageEvent {
    group_id: string

    get group_name() {
        return this.c.gl.get(this.group_id).group_name
    }

    post_type = 'message' as const
    message_type = 'group' as const
    sender: Message.Sender

    get group() {
        return this.c.pickGroup(this.group_id)
    }

    get member() {
        return this.group.pickMember(this.sender.user_id)
    }

    constructor(public c: Client, original: Message.Original) {
        const [_, user_id] = original.Content.match(/(\S+):<br\/>/) || []
        original.Content = original.Content.replace(/^@[^<]+<br\/>/, '')
        super(c, original);
        this.group_id = original.FromUserName
        this.sender = {
            user_id,
            nickname: this.group.pickMember(user_id)?.info.nickname
        }
    }

    reply(message: Sendable) {
        return this.group.sendMsg(message)
    }

    recall() {
        return this.group.recallMsg(this.message_id)
    }
}
