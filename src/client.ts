import {join} from "path";
import axios from "axios";
import {deepMerge,logQrcode} from "./common";
import {MessageRet, Sendable} from "./message/elements";
import * as fs from "fs";
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
}

export const defaultConfig: Config = {
    log_level: 'info',
    data_dir: join(process.cwd(), 'data'),
    heartbeat_interval:2000
}
export class Client extends BaseClient {
    readonly pickGroup = Group.as.bind(this) as (group_id:string)=>Group
    /** 得到一个好友对象, 通常不会重复创建 */
    readonly pickFriend = Friend.as.bind(this) as (group_id:string)=>Friend
    /** 得到一个群员对象, 通常不会重复创建 */
    readonly pickMember = Member.as.bind(this) as (group_id:string)=>Member
    /** 创建一个用户对象 */
    readonly pickUser = User.as.bind(this)
    constructor(remote: string, config: Config = {}) {
        super(remote,deepMerge(defaultConfig,config))

    }
    async qrcode() {
        const res = await this._callApi('/login/qr_code',{wx_id:this.info.wx_id})
        console.log(res)
        const {data:{qr_link}} = res
        const {data:image}= await axios.get(qr_link,{responseType:'arraybuffer'})
        const file=join(this.config.data_dir,'qrcode.png')
        fs.writeFile(file, image, () => {
            try {
                logQrcode(image)
            } catch { }
            this.logger.mark("二维码图片已保存到：" + file)
            this.emit("system.login.qrcode", { image })
        })
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
            console.log(result)
            this.qrcode()
        }
    }
}
