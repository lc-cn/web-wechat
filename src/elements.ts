import {Message} from "@/message";
import {Client} from "@/client";
import {OriginMessage} from "@/core/constanst";

interface ElementMap {
    text: {
        text: string
    }
    face: {
        id: string
    }
    at: {
        user_id: string
    }
    image: {
        file: string
        name?:string
    }|{
        file:Buffer
        name:string
    }
    video: {
        file: string
        name?:string
    }|{
        file:Buffer
        name:string
    }
    audio: {
        file: string
        name?:string
    }|{
        file:Buffer
        name:string
    }
    file:{
        file: string
        name?:string
    }|{
        file:Buffer
        name:string
    }
}

export type ElementType = keyof ElementMap
export type MessageElem<T extends ElementType = ElementType> = {
    type: T
} & ElementMap[T]
export type TextElem = MessageElem<'text'>
export type FaceElem = MessageElem<'face'>
export type ImageElem = MessageElem<'image'>
export type VideoElem = MessageElem<'video'>
export type AudioElem = MessageElem<'audio'>
export type FileElem = MessageElem<'file'>
export type Sendable = string | MessageElem | (string | MessageElem)[]

export class Parser {
    message: MessageElem[] = []
    brief: string = ''

    constructor(private c: Client) {
    }

    private async downloadMsgImg(message_id: string) {
        const res = await this.c.request.get('/cgi-bin/mmwebwx-bin/webwxgetmsgimg', {
            responseType: 'arraybuffer',
            params: {
                MsgID: message_id,
                skey: this.c.session.skey,
                type: 'big'
            }
        }).catch(e => {
            this.c.emit('internal.verbose', e, 'debug')
            throw new Error('获取图片或表情失败')
        })
        return {
            data: res.data,
            type: res.headers['content-type']
        }
    }

    private async downloadMsgVideo(message_id: string) {
        const res = await this.c.request.get('/cgi-bin/mmwebwx-bin/webwxgetvideo', {
            responseType: 'arraybuffer',
            params: {
                MsgID: message_id,
                skey: this.c.session.skey
            },
            headers: {
                'Range': 'bytes=0-'
            }
        }).catch(e => {
            this.c.emit('internal.verbose', e, 'debug')
            throw new Error('获取视频失败')
        })
        return {
            data: res.data,
            type: res.headers['content-type']
        }
    }

    private async downloadMsgVoice(message_id: string) {
        const res = await this.c.request.get('/cgi-bin/mmwebwx-bin/webwxgetvoice', {
            responseType: 'arraybuffer',
            params: {
                MsgID: message_id,
                skey: this.c.session.skey
            },
        }).catch(e => {
            this.c.emit('internal.verbose', e, 'debug')
            throw new Error('获取音频失败')
        })
        return {
            data: res.data,
            type: res.headers['content-type']
        }
    }

    private async downloadMsgMedia(message_id: string) {
        const res = await this.c.request.get('/cgi-bin/mmwebwx-bin/webwxgetmedia', {
            baseURL: `https://file.${this.c.config.base_url}`,
            responseType: 'arraybuffer',
            params: {
                MsgID: message_id,
                skey: this.c.session.skey
            },
        }).catch(e => {
            this.c.emit('internal.verbose', e, 'debug')
            throw new Error('获取文件失败')
        })
        return {
            data: res.data,
            type: res.headers['content-type']
        }
    }

    async parse(message: Message.Original) {
        switch (message.MsgType) {
            case OriginMessage.Text:
                return this.text(message.Content)
            case OriginMessage.Emotion:
            case OriginMessage.Image: {
                const {data} = await this.downloadMsgImg(message.MsgId)
                this.message.push({
                    type: 'image',
                    file: data
                })
                this.brief += `[${message.MsgType === OriginMessage.Emotion ? '原创表情' : '图片'}]`
                break;
            }
            case OriginMessage.Voice: {
                const {data} = await this.downloadMsgVoice(message.MsgId)
                this.message.push({
                    type: 'audio',
                    file: data
                })
                this.brief += `[语音]`
                break;
            }
            case OriginMessage.Video:
            case OriginMessage.MicroVideo: {
                const {data} = await this.downloadMsgVideo(message.MsgId)
                this.message.push({
                    type: 'video',
                    file: data
                })
                this.brief += '[视频]'
                break;
            }
            case OriginMessage.App:
                if (message.AppMsgType === 6) {
                    const {data}=await this.downloadMsgMedia(message.MediaId)
                    this.message.push({
                        type:'file',
                        file:data
                    })
                    this.brief+=`[文件]`
                    break;
                }
            default:
                this.c.emit('internal.verbose',`暂未支持的消息:`+JSON.stringify(message),'debug')
        }
    }

    text(text: string) {
        const faceReg = /(\[\S+])/
        while (text.length) {
            const [_, matched] = text.match(faceReg) || []
            if (!matched) break
            const matchedIdx = text.indexOf(matched)
            const prevText = text.substring(0, matchedIdx)
            if (prevText) this.message.push({type: "text", text: prevText})
            this.brief+=prevText
            this.message.push({type: "face", id: matched.slice(1, -1)})
            this.brief+=`[表情:${matched.slice(1, -1)}]`
            text = text.replace(prevText + matched, '')
        }
        if (text.length) this.message.push({type: 'text', text})
        this.brief+=text
    }
}
