import {EventEmitter} from "events";
import axios, {AxiosInstance} from "axios";
import {findOrCreateDirSync, findOrCreateFileSync, randomUUID, readFileSync,writeFileSync} from "../common";
import {join} from "path";
import {Config} from "../client";
import {getLogger, Logger} from "log4js";
import {GroupInfo} from "./group";
import {MemberInfo} from "./member";
import {FriendInfo} from "./friend";
interface WxInfo{
    deviceId:string
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
    private _info:WxInfo
    readonly fl: Map<string, FriendInfo> = new Map<string, FriendInfo>()
    readonly gl: Map<string, GroupInfo> = new Map<string, GroupInfo>()
    readonly gml = new Map<string, Map<string, MemberInfo>>()
    get info():WxInfo{
        try{
            const info=readFileSync(join(this.config.data_dir, 'device.json'))
            this._info=info
            return info
        }catch(e){
            return this._info
        }
    }
    set info(wxInfo:WxInfo){
        wxInfo.deviceId=this.info.deviceId
        if(!wxInfo.deviceId)wxInfo.deviceId=randomUUID()
        this.rpc.defaults.headers['Authorization'] = `Bearer ${wxInfo.deviceId}`
        writeFileSync(join(this.config.data_dir, 'device.json'), wxInfo)
        this._info=wxInfo
    }
    constructor(remote: string, public config: Config = {}) {
        super();
        this.logger = getLogger('client')
        this.logger.level = config.log_level
        findOrCreateDirSync(config.data_dir)
        const isNew = findOrCreateFileSync(join(config.data_dir, 'device.json'), {device_id: randomUUID()})
        if (isNew) {
            this.logger.mark('create new device id:' + this.info.deviceId)
        }
        this.rpc = axios.create({
            baseURL: remote,
            headers: {
                "Authorization": `Bearer ${this.info.deviceId}`,
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
        let checkInterval
        this.on('system.login.qrcode',()=>{
            checkInterval= setInterval(()=>this._checkStatus(),5000)
        })
        this.on('system.online', async ()=>{
            clearInterval(checkInterval)
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
        })
    }

    protected async _initFriendList() {
        const contactIds: string[] = []
        let res, wx_contact_seq = 0,room_contact_seq = 0
        do {
            res = await this._callApi('/contact/list/all', {wx_contact_seq,room_contact_seq})
            console.log(res)
            wx_contact_seq= Number(res.data.current_wx_contact_seq)
            room_contact_seq=Number(res.data.current_chat_room_contact_seq)
            contactIds.push(...res.data.ids.filter(id => id.startsWith('wxid_')))
        } while (res.code === '0' && res.data.ids.length)
        let task = []
        while (contactIds.length) {
            task.push(this._callApi('/contact/batch', {ids: contactIds.splice(0, 20)}).then(res => res.data))
        }
        const friendList: FriendInfo[] = await Promise.all(task).then(res => res.flat())
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
