import {EventEmitter} from "events";
import axios, {AxiosInstance} from "axios";
import {findOrCreateDirSync, findOrCreateFileSync, logQrcode, randomUUID, readFileSync, writeFileSync} from "../common";
import {join} from "path";
import {Config} from "../client";
import {getLogger, Logger} from "log4js";
import {GroupInfo} from "./group";
import {MemberInfo} from "./member";
import {FriendInfo} from "./friend";
import * as fs from "fs";
import {Message} from "../message";
interface AccountInfo{
    wx_id?:string
    weixin?:string
    nick_name?:string
    sex?:'1'|'0'
    country?:string
    city?:string
    signature?:string
    small_head_img_url?:string
    big_head_img_url?:string
}

export class BaseClient extends EventEmitter {
    public rpc: AxiosInstance
    public logger: Logger
    public dir: string
    readonly fl: Map<string, FriendInfo> = new Map<string, FriendInfo>()
    readonly gl: Map<string, GroupInfo> = new Map<string, GroupInfo>()
    readonly gml = new Map<string, Map<string, MemberInfo>>()
    public deviceId:string
    public info:AccountInfo
    private intervals: Map<string, NodeJS.Timer> = new Map<string, NodeJS.Timer>()
    constructor(public uin: string, public config: Config = {}) {
        super();
        this.logger = getLogger('client')
        this.logger.level = config.log_level
        this.dir=join(config.data_dir, uin)
        findOrCreateDirSync(this.dir)
        const isNew = findOrCreateFileSync(join(this.dir, 'device'), randomUUID())
        this.deviceId=readFileSync(join(this.dir, 'device')).toString()
        if (isNew) {
            this.logger.mark('create new device id:' + this.deviceId)
        }
        this.rpc = axios.create({
            baseURL: config.remote,
            headers: {
                "Authorization": `Bearer ${this.deviceId}`,
                "Content-Type": "application/json",
                "Connection": "keep-alive"
            }
        })
        this.rpc.interceptors.request.use(config => {
            if (config.method.toLowerCase() === 'get') {
                if (config.params) {
                    const params = Object.keys(config.params).filter(key=>Boolean(config.params[key])).map(key => `${key}=${config.params[key]}`).join('&')
                    config.url.includes('?') ? config.url += '&' + params : config.url += '?' + params
                }
            }
            this.logger.debug(`[apply remote] ${config.method}: ${config.url}`)
            return config
        })
        this.rpc.interceptors.response.use((res) => {
            if (res.status !== 200) {
                this.logger.error(`${res.status} ${res.statusText}`)
                throw new Error(`${res.status} ${res.statusText}`)
            }
            return res.data
        })
        this.on('system.login',this.getQrcode.bind(this))
        this.on('system.online', this._init.bind(this))
        this.on('system.ready',this._start.bind(this))
    }
    async getQrcode(){
        const res = await this._callApi('/login/qr_code',{wx_id:this.uin})
        this.logger.debug(res)
        const {data:{qr_link}} = res || {data:{qr_link:''}}
        const {data:image}= await axios.get(qr_link,{responseType:'arraybuffer'})
        const file=join(this.dir,'qrcode.png')
        fs.writeFile(file, image, () => {
            try {
                logQrcode(image)
            } catch { }
            this.logger.mark("二维码图片已保存到：" + file)
        })
        this.intervals.set('checkStatus',setInterval(()=>this._checkStatus(),1000))
    }
    _start(){
        this.off('system.online',this._init)
        this.intervals.set('msgSync',setInterval(()=>this._syncMsg(),2000))
    }
    async _stop(){

    }
    private async _syncMsg(){
        const res=await this._callApi('/message/sync',{}).then(res=>res)
        if(res && res.data){
            for(const msg of res.data.add_msgs){
                if(this.config.ignore_self && msg.from_user_name.str===this.uin) continue
                const type=msg.from_user_name.str.endsWith('@chatroom')?'group':'private'
                if(!msg.from_user_name.str.match(/(^wxid_)|(@chatroom$)/)) return
                if(msg.push_content){
                    this.logger.info(`[recv ${type}]${msg.push_content}`)
                }
                new Message(this as any,msg)
            }
        }
    }
    private async _init(){
        clearInterval(this.intervals.get('checkStatus'))
        this.intervals.delete('checkStatus')
        if(this.config.heartbeat_interval){
            setInterval(()=>this._heartbeat(),this.config.heartbeat_interval)
        }
        this.logger.info('登录成功')
        const res=await this._callApi('user/profile')
        this.info=res.data
        this.logger.mark(`Welcome, ${this.info.nick_name} ! 正在加载资源...`)
        await Promise.all([this._initGroupList(),this._initFriendList()])
        this.logger.info(`加载了${this.fl.size}个好友，${this.gl.size}个群`)
        this.emit('system.ready')
    }
    protected async _initFriendList() {
        const friendIds: string[] = []
        let res, wx_contact_seq = 0,room_contact_seq = 0
        do {
            res = await this._callApi('/contact/list/all', {wx_contact_seq,room_contact_seq})
            wx_contact_seq= Number(res.data.current_wx_contact_seq)
            room_contact_seq=Number(res.data.current_chat_room_contact_seq)
            friendIds.push(...res.data.ids.filter(id => id.startsWith('wxid_')))
        } while (res.code === '0' && res.data.ids.length)
        let friendTasks = []
        while (friendIds.length) {
            friendTasks.push(this._callApi('/contact/batch', {ids: friendIds.splice(0, 20)}).then(res => res.data))
        }
        const friendList: FriendInfo[] = await Promise.all(friendTasks).then(res => res.flat())
        for (const friend of friendList) {
            this.fl.set(friend.id, friend)
        }
    }

    protected async _initGroupList() {
        const res = await this._callApi('/contact/list/group')
        if (res.code === '0' && res.data.ids) {
            const groupList: GroupInfo[] = await Promise.all(res.data.ids.map((group_id) => {
                return new Promise(resolve => {
                    this._callApi('/group/get/info', {group_id})
                        .then(res => resolve(res.data))
                })
            })).then((res) => res.flat())
            for (const group of groupList) {
                this.gl.set(group.wx_id, group)
                const map = new Map<string, MemberInfo>()
                this.gml.set(group.wx_id, map)
            }
        }

    }

    protected async _heartbeat() {
        const res = await this._callApi('/login/heartbeat')
        if (res.code !== '0') {
            this.logger.error(res.msg)
        }
    }

    async _callApi(url: string, params?: Record<string, any>, method?: 'get')
    async _callApi(url: string, data?: Record<string, any>, method?: 'post')
    async _callApi(url: string, params?: Record<string, any>, data?: Record<string, any>, method?: 'post')
    async _callApi(...args: any[]) {
        let [url, params, data, method] = args
        if (typeof params === 'string') {
            method = params
            params = undefined
        } else if (typeof data === 'string') {
            method = data
            if (method === 'get') {
                data = undefined
            } else if (method === 'post') {
                data = params
            }
        }
        if (!method) method = 'get'
        return new Promise((resolve, reject) => {
            this.rpc.request({
                url,
                params,
                data,
                method
            }).then((res) => resolve(res)).catch(reject)
        })
    }

    async _checkStatus() {
        const res = await this._callApi('/login/check')
        if (res && res.data) {
            if (res.data.wx_id) {
                this.emit('system.online')
            }
        }
    }
}

export class ApiRejection {
    constructor(public code: number, public message = "unknown") {
        this.code = Number(this.code)
        this.message = this.message?.toString() || "unknown"
    }
}
