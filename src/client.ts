import {join} from "path";
import {deepMerge, removeFileSync} from "./common";
import {Sendable} from "./message/elements";
import {BaseClient} from "./core/baseClient";
import {Group} from "./core/group";
import {Friend} from "./core/friend";
import {Member} from "./core/member";
import {User} from "./core";
import {EventMap} from "./event";

export type LogLevel = 'info' | 'none' | 'error' | 'debug' | 'warn' | 'trace' | 'silly' | 'mark';

export interface Config {
    log_level?: LogLevel
    data_dir?: string
    ignore_self?:boolean
    heartbeat_interval?: number
    remote?: string
}

export const defaultConfig: Config = {
    log_level: 'info',
    data_dir: join(process.cwd(), 'data'),
    heartbeat_interval:2000,
    ignore_self:true,
    remote: 'http://49.234.86.244:8080/'
}
type Listener=(...args:any[])=>void
export interface Client extends BaseClient {
    on<K extends keyof EventMap>(event: K, listener: EventMap[K]): this;
    on<S extends keyof string|symbol>(event: S & Exclude<keyof EventMap, S>, listener:Listener ): this;
    once<K extends keyof EventMap>(event: K, listener: EventMap[K]): this;
    once<S extends keyof string|symbol>(event: S & Exclude<keyof EventMap, S>, listener:Listener ): this;
    addListener<K extends keyof EventMap>(event: K, listener: EventMap[K]): this;
    addListener<S extends keyof string|symbol>(event: S & Exclude<keyof EventMap, S>, listener:Listener ): this;
    off<K extends keyof EventMap>(event: K, listener: EventMap[K]): this;
    off<S extends keyof string|symbol>(event: S & Exclude<keyof EventMap, S>, listener:Listener ): this;
}
export class Client extends BaseClient {
    readonly pickGroup = Group.as.bind(this) as (group_id:string,strict?:boolean)=>Group
    /** 得到一个好友对象, 通常不会重复创建 */
    readonly pickFriend = Friend.as.bind(this) as (user_id:string,strict?:boolean)=>Friend
    /** 得到一个群员对象, 通常不会重复创建 */
    readonly pickMember = Member.as.bind(this) as (group_id:string,user_id:string,strict?:boolean)=>Member
    /** 创建一个用户对象 */
    readonly pickUser = User.as.bind(this) as (user_id:string)=>User
    constructor(uin: string, config: Config = {}) {
        super(uin,deepMerge(defaultConfig,config))

    }
    async sendPrivateMsg(user_id:string,message:Sendable){
        return this.pickFriend(user_id).sendMsg(message)
    }
    async sendGroupMsg(group_id:string,message:Sendable){
        return this.pickGroup(group_id).sendMsg(message)
    }
    async getGroupList(){
        return this.gl
    }
    async getFriendList(){
        return this.fl
    }
    async getGroupMemberList(group_id:string){
        return this.pickGroup(group_id).getMemberList()
    }
    async login(){
        const result= await this._callApi('/login/auto')
        if(result.code==='26')
            this.emit('system.online')
        else{
            // removeFileSync(join(this.dir,'device'))
            this.emit("system.login")
            this.logger.error(result)
        }
    }
    async logout(){
        return await this._callApi('/logout').then(res=>res.data)
    }
}
