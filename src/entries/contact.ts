import {BaseClient} from "@/core/baseClient";
import {Client} from "@/client";
import {convertEmoji, isRoomContact} from "@/utils";
import {Group} from "@/entries/group";
import {Friend} from "@/entries/friend";
import {Member} from "@/entries/member";
import {FileElem, ImageElem, MessageElem, Sendable, TextElem, VideoElem} from "@/elements";
import {OriginMessage} from "@/core/constanst";
import {Message} from "@/message";

export class Contact{
    info:Contact.Info
    get client(){
        return this.c
    }
    constructor(private c:Client,info:Contact.Info) {
        this.info={
            avatar:info.avatar,
            username:info.username,
            nickname:convertEmoji(info.nickname),
            remark:convertEmoji(info.remark)
        }
    }
    asFriend(){
        return this.c.pickFriend(this.info.username)
    }
    asGroup(){
        return this.c.pickGroup(this.info.username)
    }
    private _uploadMedia(data:string|Buffer,filename:string){
        return this.c.uploadMedia(data,filename,this.info.username)
    }
    private async sendText(text:string){
        const msgId=Message.genMsgId()
        const {data}=await this.c.request.post('/cgi-bin/mmwebwx-bin/webwxsendmsg',{
            'BaseRequest': this.c.getBaseRequest(),
            'Scene': 0,
            'Msg': {
                'Type': OriginMessage.Text,
                'Content': text,
                'FromUserName': this.c.info.username,
                'ToUserName': this.info.username,
                'LocalID': msgId,
                'ClientMsgId': msgId
            }
        },{
            params:{
                'pass_ticket': this.c.session.passTicket,
                'lang': 'zh_CN'
            }
        })
        if(data.BaseResponse.Ret!==0) throw new Error('发送失败')
        this.c.emit('internal.verbose',`send [${isRoomContact(this.info.username)?'Group':'Private'}(${this.info.nickname})]:${text}`)
        return data
    }
    private async sendImg(file:string|Buffer,filename:string){
        const {mediaId,ext}=await this._uploadMedia(file,filename)
        const msgId=Message.genMsgId()
        const {data}=await this.c.request({
            url:ext==='gif'?'/cgi-bin/mmwebwx-bin/webwxsendemoticon':'/cgi-bin/mmwebwx-bin/webwxsendmsgimg',
            method:'POST',
            data:{
                'BaseRequest': this.c.getBaseRequest(),
                'Scene': 0,
                'Msg': {
                    'Type': ext==='gif'?OriginMessage.Emotion:OriginMessage.Image,
                    'MediaId': mediaId,
                    'EmojiFlag': ext==='gif'?2:undefined,
                    'FromUserName': this.c.info.username,
                    'ToUserName': this.info.username,
                    'LocalID': msgId,
                    'ClientMsgId': msgId
                }
            },
            params:{
                'pass_ticket': this.c.session.passTicket,
                'fun': 'async',
                'f': 'json',
                'lang': 'zh_CN'
            }
        })
        if(data.BaseResponse.Ret!==0){
            this.c.emit('internal.verbose',data,'debug')
            throw new Error('发送失败')
        }
        this.c.emit('internal.verbose',`send [${isRoomContact(this.info.username)?'Group':'Private'}(${this.info.nickname})]:[图片]`)
        return data
    }
    private async sendVideo(file:string|Buffer,filename:string){
        const {mediaId}=await this._uploadMedia(file,filename)
        const msgId=Message.genMsgId()
        const {data}=await this.c.request({
            url:'/cgi-bin/mmwebwx-bin/webwxsendvideomsg',
            method:'post',
            data:{
                'BaseRequest': this.c.getBaseRequest(),
                'Scene': 0,
                'Msg': {
                    'Type': OriginMessage.Video,
                    'MediaId': mediaId,
                    'FromUserName': this.c.info.username,
                    'ToUserName': this.info.username,
                    'LocalID': msgId,
                    'ClientMsgId': msgId
                }
            },
            params:{
                'pass_ticket': this.c.session.passTicket,
                'fun': 'async',
                'f': 'json',
                'lang': 'zh_CN'
            }
        })
        if(data.BaseResponse.Ret!==0) throw new Error('发送失败')
        this.c.emit('internal.verbose',`send [${isRoomContact(this.info.username)?'Group':'Private'}(${this.info.nickname})]:[视频]`)
        return data
    }

    private async sendFile(file:string|Buffer,filename:string){
        const {mediaId,name, size, ext}=await this._uploadMedia(file,filename)
        const msgId=Message.genMsgId()
        const {data}=await this.c.request({
            url:'/cgi-bin/mmwebwx-bin/webwxsendappmsg',
            method:'post',
            data:{
                'BaseRequest': this.c.getBaseRequest(),
                'Scene': 0,
                'Msg': {
                    'Type': 6,
                    'Content': `<appmsg appid='wxeb7ec651dd0aefa9' sdkver=''><title>${name}</title><des></des><action></action><type>6</type><content></content><url></url><lowurl></lowurl><appattach><totallen>${size}</totallen><attachid>${mediaId}</attachid><fileext>${ext}</fileext></appattach><extinfo></extinfo></appmsg>`,
                    'FromUserName': this.c.info.username,
                    'ToUserName': this.info.username,
                    'LocalID': msgId,
                    'ClientMsgId': msgId
                }
            },
            params:{
                'pass_ticket': this.c.session.passTicket,
                'fun': 'async',
                'f': 'json',
                'lang': 'zh_CN'
            }
        })
        if(data.BaseResponse.Ret!==0) throw new Error('发送失败')
        this.c.emit('internal.verbose',`send [${isRoomContact(this.info.username)?'Group':'Private'}(${this.info.nickname})]:[文件]`)
        return data
    }
    private _sendMsg(message:MessageElem){
        const fixStrFile=<T extends MessageElem>(message:MessageElem):T=>{
            const tempMsg=message as ImageElem
            if(!tempMsg.name && typeof tempMsg.file==="string"){
                if(/data:\S+\/(\S+);base64,/.test(tempMsg.file)){
                    const [_,type]=tempMsg.file.match(/data:\S+\/(\S+);base64,/)||[]
                    tempMsg.name=`${Math.random().toString(36).slice(2)}.${type}`
                }else{
                    tempMsg.name=tempMsg.file
                }
            }
            return tempMsg as T
        }
        switch (message.type){
            case 'text':
                return this.sendText((message as TextElem).text)
            case 'image':{
                const tempMsg=fixStrFile<ImageElem>(message)
                return this.sendImg(tempMsg.file,tempMsg.name)
            }
            case 'video':{
                const tempMsg=fixStrFile<ImageElem>(message)
                return this.sendVideo(tempMsg.file,tempMsg.name)
            }
            case 'file':{
                const tempMsg=fixStrFile<ImageElem>(message)
                return this.sendFile(tempMsg.file,tempMsg.name)
            }
            default:
                throw new Error('不支持发送的消息元素：'+message.type)
        }
    }
    async sendMsg<T extends Sendable>(message:T):Promise<T extends any[]?string[]:string>{
        const waitingQueue:MessageElem[]=[]
        let text:string='';
        for (let msg of [].concat(message)){
            if (typeof msg==='string'){
                msg={type:'text',text:msg} as TextElem
            }
            if(['text','face'].includes(msg.type)){
                text+=(msg.type==='text'?msg.text:`[${msg.id}]`)
            }else{
                if(text) waitingQueue.push({
                    type:'text',
                    text:text
                })
                text=''
                waitingQueue.push(msg)
            }
        }
        if(text) waitingQueue.push({
            type:'text',
            text:text
        })
        if(!Array.isArray(message)) return (await this._sendMsg(waitingQueue[0])).MsgID
        let result:string[]=[]
        for(const message of waitingQueue){
            result.push((await this._sendMsg(message)).MsgID)
        }
        return result as any
    }
    async recallMsg(message_id:string){
        const {data}=await this.c.request({
            url:'/cgi-bin/mmwebwx-bin/webwxrevokemsg',
            method:'POST',
            data:{
                BaseRequest: this.c.getBaseRequest(),
                SvrMsgId: message_id,
                ToUserName: this.info.username,
                ClientMsgId: Message.genMsgId()
            }
        })
        return data.BaseResponse.Ret===0
    }
}
export namespace Contact{
    export interface OriginalInfo extends BaseClient.OriginalInfo{
        NickName:string
        RemarkName:string
        DisplayName:string
        MemberCount:number
        MemberList:Member.OriginalInfo[]
    }
    export interface Info {
        nickname:string
        username:string
        avatar:string
        remark:string
    }
}
