import {join} from "path";
import {deepMerge, removeFileSync} from "./common";
import {Sendable} from "./message/elements";
import {BaseClient} from "./core/baseClient";
import {Group} from "./core/group";
import {Friend} from "./core/friend";
import {Member} from "./core/member";
import {User} from "./core/user";

export type LogLevel = 'info' | 'none' | 'error' | 'debug' | 'warn' | 'trace' | 'silly' | 'mark';

export interface Config {
    log_level?: LogLevel
    data_dir?: string
    heartbeat_interval?: number
    remote?: string
}

export const defaultConfig: Config = {
    log_level: 'info',
    data_dir: join(process.cwd(), 'data'),
    heartbeat_interval:2000,
    remote: 'http://49.234.86.244:8080/'
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
            removeFileSync(join(this.dir,'device'))
            this.emit("system.login")
            this.logger.error(result)
        }
    }
}
