import {BaseClient} from "@/core/baseClient";
import * as path from "path";
import * as process from "process";
import {Dict, LogLevel} from "@/types";
import {getLogger, Logger} from "log4js";
import {Friend} from "@/entries/friend";
import {Group} from "@/entries/group";
import {Member} from "@/entries/member";
import {isRoomContact} from "@/utils";
import {AlreadyLoggedError, OriginMessage, Sex} from "@/core/constanst";
import {Contact} from "@/entries/contact";
import {Sendable} from "@/elements";
import {GroupMessageEvent, Message, PrivateMessageEvent} from "@/message";
import {FriendRequestEvent} from "@/request";

type MemberMap=Map<string,Member.Info>
export class Client extends BaseClient{
    logger:Logger
    fl:Map<string,Friend.Info>=new Map<string,Friend.Info>()
    gl:Map<string,Group.Info>=new Map<string,Group.Info>()
    gml:Map<string,MemberMap>=new Map<string, MemberMap>()
    pickGroup=Group.from.bind(this) as (group_id:string)=>Group
    pickMember=Member.from.bind(this) as (group_id:string,member_id:string)=>Member
    pickFriend=Friend.from.bind(this) as (user_id:string)=>Friend
    constructor(config:BaseClient.Config={}){
        config=Object.assign(Client.defaultConfig,config)
        super(config);
        this.logger=getLogger(`[lib-wechat]`)
        this.logger.level=config.log_level
        this.on('internal.verbose',(message:string,logLevel:LogLevel)=>{
            const fn=this.logger[logLevel]||this.logger.info
            return fn.apply(this.logger,[message])
        })
        this.on('internal.init',this.updateContacts.bind(this))
        this.on('internal.stop',this.stop.bind(this))
        this.on('internal.sync',this.handleSync.bind(this))
        this.on('internal.online',this.handleOnline.bind(this))
    }
    private handleOnline(){
        this.emit('system.online',this.info)
        this.emit('internal.verbose',`welcome ! ${this.info.nickname}`,'info')
        this.emit('internal.verbose',`加载了${this.fl.size}个好友，${this.gl.size}个群`,'info')
    }
    getGroupList(){
        return Array.from(this.gl.values())
    }
    getGroupInfo(group_id:string){
        return this.gl.get(group_id)
    }
    getGroupMemberList(group_id:string){
        return this.pickGroup(group_id).getMemberList()
    }
    getGroupMemberInfo(group_id:string,member_id:string){
        return this.pickGroup(group_id).getMemberInfo(member_id)
    }
    getFriendList(){
        return Array.from(this.fl.values())
    }
    getFriendInfo(user_id:string){
        return this.fl.get(user_id)
    }
    async sendPrivateMsg(user_id:string,message:Sendable){
        return this.pickFriend(user_id).sendMsg(message)
    }
    async sendGroupMsg(group_id:string,message:Sendable){
        return this.pickGroup(group_id).sendMsg(message)
    }
    async recallMsg(username:string,message_id:string){
        return isRoomContact(username)?
            this.pickGroup(username).recallMsg(message_id):
            this.pickFriend(username).recallMsg(message_id)
    }
    private handleSync(data:Dict){
        if (!data) {
            this.init()
            return
        }
        if (data.AddMsgCount) {
            this.emit('internal.verbose','syncPolling messages count: '+data.AddMsgCount,'debug')
            this.messageListener(data.AddMsgList)
        }
        if (data.ModContactCount) {
            this.emit('internal.verbose','syncPolling ModContactList count: '+ data.ModContactCount,'debug')
            this.updateContacts(data.ModContactList)
        }
    }
    /** 收到消息 */
    private async handleMsg(msg:Message.Original){
        const event:GroupMessageEvent|PrivateMessageEvent = Message.from.apply(this,[msg])
        await event.parse()
        this.em(`message.${event.message_type}`,event)
        if(event.message_type==='group'){
            this.emit('internal.verbose',`recv [Group(${event.group_name}),Member(${event.sender.nickname})]:${event.raw_message}`,'info')
        }else{
            this.emit('internal.verbose',`recv [Private(${event.sender.nickname})]:${event.raw_message}`,'info')
        }
    }
    /** 收到加好友请求 */
    private handleRequest(msg:Message.Original){
        const event=new FriendRequestEvent(this,{
            ticket:msg.RecommendInfo.Ticket,
            user_id:msg.RecommendInfo.UserName,
            nickname:msg.RecommendInfo.NickName
        })
        this.emit('internal.verbose',`用户(${event.nickname})申请加好友`,'info')
        this.em('request.friend.add',event)
    }
    /** 通知消息 */
    private handleNotice(msg:Message.Original){

    }
    /** 消息总线 */
    async messageListener(messageList:Message.Original[]){
        const needGetContacts:string[]=[]
        messageList.forEach(msg=>{
            if(msg.MsgType===OriginMessage.StatusNotice){
                needGetContacts.push(...msg.StatusNotifyUserName.split(','))
            }else{
                if(isRoomContact(msg.FromUserName) && !this.gl.get(msg.FromUserName)){
                    needGetContacts.push(msg.FromUserName)
                }
                if(!isRoomContact(msg.FromUserName) && !this.fl.get(msg.FromUserName)){
                    needGetContacts.push(msg.FromUserName)
                }
            }
        })
        await this.batchGetContact([...new Set(needGetContacts.filter(Boolean))])
        for(const msg of messageList){
            switch (msg.MsgType){
                case OriginMessage.Text:
                case OriginMessage.Image:
                case OriginMessage.Emotion:
                case OriginMessage.Video:
                case OriginMessage.MicroVideo:
                case OriginMessage.Voice:
                case OriginMessage.App:
                    return this.handleMsg(msg)
                case OriginMessage.VerifyMsg:
                    return this.handleRequest(msg)
                case OriginMessage.Sys:
                case OriginMessage.StatusNotice:
                case OriginMessage.Recalled:
                case OriginMessage.SysNotice:
                    return this.handleNotice(msg)
            }

        }
    }
    private updateContacts(list:Contact.OriginalInfo[]){
        for(const contact of list){
            if(isRoomContact(contact.UserName)){
                let gml=this.gml.get(contact.UserName)
                if(!gml) this.gml.set(contact.UserName,gml=new Map<string,Member.Info>)
                this.gl.set(contact.UserName,{
                    avatar: contact.HeadImgUrl,
                    nickname: contact.NickName,
                    username:contact.UserName,
                    remark: contact.RemarkName,
                    group_id:contact.UserName,
                    group_name:contact.NickName,
                    member_count:contact.MemberCount
                })
                if(contact.MemberCount){
                    for(const member of contact.MemberList){
                        gml.set(member.UserName,{
                            avatar: contact.HeadImgUrl,
                            username:member.UserName,
                            group_id: contact.UserName,
                            remark: member.NickName,
                            user_id:member.UserName,
                            nickname:member.NickName
                        })
                    }
                }
            }else{
                this.fl.set(contact.UserName,{
                    user_id:contact.UserName,
                    username:contact.UserName,
                    nickname:contact.NickName,
                    avatar:contact.HeadImgUrl,
                    remark:contact.RemarkName,
                    sex:contact.Sex===0?Sex.Male:Sex.Female
                })
            }
        }
    }
    async start(){
        process.stdin.on('data',()=>{})
        if(this.uin) return this.init().catch(e=>{
            if(!(e instanceof AlreadyLoggedError)) throw e
            return this.logout()
        });
        return this.login()
    }
    async stop(){

    }
}
export namespace Client{
    export const defaultConfig:BaseClient.Config = {
        log_level:'info',
        base_url:`wx.qq.com`,
        data_dir:path.join(process.cwd(),'data')
    }
}
