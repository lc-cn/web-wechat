import {EventEmitter} from 'events'
import * as qrcodeTerminal from "qrcode-terminal";
import axios, {AxiosInstance} from "axios";
import {Writable} from 'stream'
import {Dict, LogLevel} from "@/types";
import * as path from "path";
import * as fs from "fs";
import * as bl from 'bl'
import * as FormData from 'form-data'
import {getDeviceID, getPgv} from "@/utils";
import {AlreadyLoggedError, alreadyLogoutError, CHUNK_SIZE, Sex, Status, SyncRet, SyncSelector} from "@/core/constanst";
import {Contact} from "@/entries/contact";
import mime from "@/core/mime";
import * as process from "process";

export class BaseClient extends EventEmitter {
    uin: number
    info:BaseClient.Info
    avatar=''
    status:Status
    public data_dir: string
    private lastSyncTime = 0
    private syncPollingId = 0
    private syncErrorCount = 0
    private checkPollingId:NodeJS.Timeout
    private retryPollingId:NodeJS.Timeout
    cookie:Dict<string>={
        'pgv_pvi':getPgv(),
        'pgv_si':getPgv('s'),
    }
    session: BaseClient.Session = {
    }
    request: AxiosInstance
    get token(){
        return {
            cookie:this.cookie,
            session:this.session,
            base_url:this.config.base_url,
            info:this.info,
        }
    }
    set token(token:BaseClient.Token){
        this.cookie=token.cookie
        this.session=token.session
        this.info=token.info
        this.config.base_url=token.base_url
    }
    constructor(public config: BaseClient.Config) {
        super();
        this.data_dir = path.resolve(process.cwd(),config.data_dir);
        if(!fs.existsSync(this.data_dir)) fs.mkdirSync(this.data_dir)
        const token_file = path.join(this.data_dir, "token.json");
        if (fs.existsSync(token_file)) {
            this.token = require(token_file);
            this.uin = +this.token.info.uin;
        }
        this.initRequest()
    }
    private initRequest(){
        this.request = axios.create({
            baseURL:`https://${this.config.base_url}`,
            headers: {
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
                'connection': 'close',
            },
            timeout: this.config.timeout || 1000 * 60,
            httpAgent: false,
            httpsAgent: false
        })
        this.request.interceptors.request.use(config => {
            config.headers['cookie'] = Object.keys(this.cookie).map(key => {
                return `${key}=${this.cookie[key]}`
            }).join('; ')
            return config
        },(err)=>{
            return Promise.reject(err);
        })
        this.request.interceptors.response.use((res)=>{
            const setCookie = res.headers['set-cookie']
            if (setCookie) {
                setCookie.forEach(item => {
                    let pm = item.match(/^(.+?)\s?=\s?(.+?);/)
                    if (pm) {
                        this.cookie[pm[1]] = pm[2]
                    }
                })
            }
            return res
        },err => {
            if (err && err.response) {
                delete err.response.request
                delete err.response.config
                let setCookie = err.response.headers['set-cookie']
                if (err.response.status === 301 && setCookie) {
                    setCookie.forEach((item:string) => {
                        let pm = item.match(/^(.+?)\s?=\s?(.+?);/)
                        if (pm) {
                            this.cookie[pm[1]] = pm[2]
                        }
                    })
                }
            }
            return Promise.reject(err)
        })
    }
    private async genQrcode() {
        if(!this.session.uuid) await this.getUUID()
        const qrcodeUrl='https://login.weixin.qq.com/l/' + this.session.uuid
        qrcodeTerminal.generate(qrcodeUrl, {
            small: true
        }, (qrcode: string) => {
            this.emit('internal.verbose',`请使用微信扫描二维码登录,url链接：${qrcodeUrl}`,'mark')
            console.log(qrcode)
        })
        const data=await axios.get<Buffer>('https://login.weixin.qq.com/qrcode/'+this.session.uuid,
            {responseType:'arraybuffer'})
        this.emit('login.qrcode',data)
        const file=path.resolve(this.data_dir,'./qrcode.jpeg')
        fs.writeFileSync(file,data.data)
        this.emit('internal.verbose','二维码已保存到'+file,'mark')
        return Buffer.from(data.data)
    }

    private async getUUID() {
        const result=await this.request.post<string>('https://login.wx.qq.com/jslogin?appid=wx782c26e4c19acffb&fun=new&lang=zh-CN&redirect_uri=https://wx.qq.com/cgi-bin/mmwebwx-bin/webwxnewloginpage?mod=desktop',undefined,{
            baseURL:'https://login.wx.qq.com',
            url:'',
        })
        const [_,code]=result.data.match(/window\.QRLogin\.code\s*=\s*(\d+)/)||[]
        if(code!=='200') throw new Error('获取UUID失败')
        const [__,uuid]=result.data.match(/window\.QRLogin\.uuid\s*=\s*"(\S+)"/)||[]
        return this.session.uuid=uuid
    }


    async queryQrcodeStatus(){
        const result=await this.request.get<string>('/cgi-bin/mmwebwx-bin/login',{
            baseURL:'https://login.wx.qq.com',
            params:{
                'tip': 0,
                'uuid': this.session.uuid,
                'loginicon': true,
                'r': ~new Date()
            }
        })
        const [_,code]=result.data.match(/window\.code\s*=\s*(\d+)/)||[]
        if(code==='400') throw new Error('获取手机确认登录信息失败:'+result.data)
        if(code==='201'){
            const [_,avatar]=result.data.match(/window\.userAvatar\s*=\s*'([^']+)+'/)||[]
            this.avatar=avatar
        }
        if(code==='200'){
            const [__,redirect_url]=result.data.match(/window\.redirect_uri="([^"]+)"/)||[]
            return {
                code,
                redirect_url
            }
        }
        return this.queryQrcodeStatus()
    }
    async qrcodeLogin(){
        return new Promise<string>(async (resolve, reject) => {

            const qrcodeStatus=await this.queryQrcodeStatus()
            if(qrcodeStatus.code==='200') {
                resolve(qrcodeStatus.redirect_url)
            }else if(qrcodeStatus.code!=='201'){
                reject('登录失败')
            }
        })
    }
    /** 首次登录 */
    async login() {
        await this.genQrcode()
        const redirect_url= await this.qrcodeLogin()
        const baseURL=redirect_url.match(/(?:\w+\.)+\w+/)[0]
        this.config.base_url=baseURL||this.config.base_url
        this.initRequest()
        await this.request.get(redirect_url,{
            maxRedirects:0,
            headers:{
                'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
                'client-version':"2.0.0",
                'referer':'https://wx.qq.com/?&lang=zh_CN&target=t',
                'extspam':'Go8FCIkFEokFCggwMDAwMDAwMRAGGvAESySibk50w5Wb3uTl2c2h64jVVrV7gNs06GFlWplHQbY/5FfiO++1yH4ykCyNPWKXmco+wfQzK5R98D3so7rJ5LmGFvBLjGceleySrc3SOf2Pc1gVehzJgODeS0lDL3/I/0S2SSE98YgKleq6Uqx6ndTy9yaL9qFxJL7eiA/R3SEfTaW1SBoSITIu+EEkXff+Pv8NHOk7N57rcGk1w0ZzRrQDkXTOXFN2iHYIzAAZPIOY45Lsh+A4slpgnDiaOvRtlQYCt97nmPLuTipOJ8Qc5pM7ZsOsAPPrCQL7nK0I7aPrFDF0q4ziUUKettzW8MrAaiVfmbD1/VkmLNVqqZVvBCtRblXb5FHmtS8FxnqCzYP4WFvz3T0TcrOqwLX1M/DQvcHaGGw0B0y4bZMs7lVScGBFxMj3vbFi2SRKbKhaitxHfYHAOAa0X7/MSS0RNAjdwoyGHeOepXOKY+h3iHeqCvgOH6LOifdHf/1aaZNwSkGotYnYScW8Yx63LnSwba7+hESrtPa/huRmB9KWvMCKbDThL/nne14hnL277EDCSocPu3rOSYjuB9gKSOdVmWsj9Dxb/iZIe+S6AiG29Esm+/eUacSba0k8wn5HhHg9d4tIcixrxveflc8vi2/wNQGVFNsGO6tB5WF0xf/plngOvQ1/ivGV/C1Qpdhzznh0ExAVJ6dwzNg7qIEBaw+BzTJTUuRcPk92Sn6QDn2Pu3mpONaEumacjW4w6ipPnPw+g2TfywJjeEcpSZaP4Q3YV5HG8D6UjWA4GSkBKculWpdCMadx0usMomsSS/74QgpYqcPkmamB4nVv1JxczYITIqItIKjD35IGKAUwAA=='
            }
        }).catch(error=>{
            if (error.response.status === 301) {
                let data = error.response.data
                let pm = data.match(/<ret>(.*)<\/ret>/)
                if (pm && pm[1] === '0') {
                    this.session.skey = data.match(/<skey>(.*)<\/skey>/)[1]
                    this.session.sid = data.match(/<wxsid>(.*)<\/wxsid>/)[1]
                    this.uin = data.match(/<wxuin>(.*)<\/wxuin>/)[1]
                    this.session.passTicket = data.match(/<pass_ticket>(.*)<\/pass_ticket>/)[1]
                }
                if (error.response.headers['set-cookie']) {
                    error.response.headers['set-cookie'].forEach(item => {
                        if (/webwx.*?data.*?ticket/i.test(item)) {
                            this.session.webwxDataTicket = item.match(/=(.*?);/)[1]
                        } else if (/wxuin/i.test(item)) {
                            this.uin = item.match(/=(.*?);/)[1]
                        } else if (/wxsid/i.test(item)) {
                            this.session.sid = item.match(/=(.*?);/)[1]
                        } else if (/pass_ticket/i.test(item)) {
                            this.session.passTicket = item.match(/=(.*?);/)[1]
                        }
                    })
                }
            } else {
                throw error
            }
        }).catch(e=>{
            e.tips='登录失败'
            throw e
        })
        this.status=Status.Login
        return await this.init().catch(e=>{
            if(e instanceof AlreadyLoggedError) return this.logout()
            throw e
        })
    }
    async logout(){
        return new Promise<string>(async resolve=>{
            this.status=Status.Logout
            this.request.post('/cgi-bin/mmwebwx-bin/webwxlogout',undefined,{
                params:{
                    redirect: 1,
                    type: 0,
                    skey: this.session.skey,
                    lang: 'zh_CN'
                }
            }).then(()=>resolve('登出成功'))
                .catch(()=>resolve('可能登出成功'))
                .finally(()=>{
                    fs.unlinkSync(path.join(this.data_dir,'token.json'))
                })
        })
    }
    async addFriend(user_id:string,message:string=`我是${this.info.nickname}`){
        const {data}=await this.request({
            url:'/cgi-bin/mmwebwx-bin/webwxverifyuser',
            method:'POST',
            data:{
                'BaseRequest': this.getBaseRequest(),
                'Opcode': 2,
                'VerifyUserListSize': 1,
                'VerifyUserList': [{
                    'Value': user_id,
                    'VerifyUserTicket': ''
                }],
                'VerifyContent': message,
                'SceneListCount': 1,
                'SceneList': [33],
                'skey': this.session.skey
            },
            params:{
                'pass_ticket': this.session.passTicket,
                'lang': 'zh_CN'
            }
        })
        if(data.BaseResponse.Ret!==200) throw new Error('添加好友失败')
    }
    getBaseRequest(){
        return {
            Uin: this.uin,
            Sid: this.session.sid,
            Skey: this.session.skey,
            DeviceID: getDeviceID()
        }
    }
    async init(){
        const {data}=await this.request.post('/cgi-bin/mmwebwx-bin/webwxinit',{
            BaseRequest:this.getBaseRequest()
        },{
            params: {
                pass_ticket: this.session.passTicket,
                r:Math.ceil(Date.now()/ -1579)
            }
        })
        if(data.BaseResponse.Ret===SyncRet.Logout) throw alreadyLogoutError
        if(data.BaseResponse.Ret!==SyncRet.Success) new Error('微信初始化失败')
        this.session.skey=data.SKey||this.session.skey
        const {User:user}=data
        this.info={
            uin:user.Uin,
            username:user.UserName,
            nickname:user.NickName,
            avatar:user.HeadImgUrl,
            remark:user.RemarkName,
            sex:user.Sex===0?Sex.Male:Sex.Female,
        }
        this.updateSyncKey(data)
        fs.writeFileSync(path.join(this.data_dir,'token.json'), JSON.stringify(this.token),'utf8')
        this.status=Status.Login
        this.lastSyncTime = Date.now()
        this.syncPolling()
        this.checkPolling()
        this.emit('internal.init',data.ContactList)
        this.notifyMobile()
            .catch(err => this.emit('error', err))
        const contacts=await this.getContact()
        this.emit('internal.verbose','getContact count: '+contacts.length,'debug')
        this.emit('internal.init',contacts)
        this.emit('internal.online')
    }
    async uploadMedia(file:string|Buffer,filename:string,user_id:string){
        let data:Buffer;
        const name:string=filename
        const ext:string=name.match(/.*\.(.*)/)?.[1].toLowerCase()||''
        const type:string=mime.lookup(ext)
        let mediatype:string
        switch (ext){
            case 'bmp':
            case 'jpeg':
            case 'jpg':
            case 'png':
                mediatype = 'pic'
                break
            case 'mp4':
                mediatype = 'video'
                break
            default:
                mediatype = 'doc'
        }
        if(typeof file==="string"){
            if(/^data:(\S+);base64,(.+)/.test(file)){
                data=Buffer.from(file.replace(/data:(\S+);base64,/,''),'base64')
            }else if(/^https?:\/\//.test(file)){
                const res=await axios.get(file,{responseType:'arraybuffer'})
                data=Buffer.from(res.data)
            }else if(fs.existsSync(file)){
                data=Buffer.from(fs.readFileSync(file,'binary'),'binary')
            }
        }else{
            data=file
        }
        const size=data.length
        const forms=this.chunkMediaForms({ name, data, type, mediatype, size, user_id })
        const readFormData=(form:FormData)=>{
            return new Promise<Buffer>((resolve,reject) => {
                form.pipe(bl((err, buffer) => {
                    if(err) return reject(err)
                    resolve(buffer)
                }) as unknown as Writable)
            })
        }
        let result
        for(const form of forms){
            const bufData=await readFormData(form)
            result=await this.request({
                url:'/cgi-bin/mmwebwx-bin/webwxuploadmedia',
                baseURL:`https://file.${this.config.base_url}`,
                headers:form.getHeaders(),
                method:'POST',
                data:bufData,
                params:{
                    r:'json'
                }
            })
        }
        if(!result) throw new Error('上传文件失败')
        if(typeof result.data==="string"){
            const [_,MediaId]=result.data.match(/MediaId:"([^"]+)"/)||[]
            result.data={
                MediaId
            }
        }
        return {
            name: name,
            size: size,
            ext: ext,
            mediatype: mediatype,
            mediaId: result.data.MediaId
        }
    }
    private chunkMediaForms({ name, data, type, mediatype, size, user_id }:any):FormData[]{
        const uploadMediaRequest = JSON.stringify({
            BaseRequest: this.getBaseRequest(),
            ClientMediaId: Math.ceil(Date.now() * 1e3),
            TotalLen: size,
            StartPos: 0,
            DataLen: size,
            MediaType: 4,
            UploadType: 2,
            FromUserName: this.info.username,
            ToUserName: user_id || this.info.username
        })
        if(size<=CHUNK_SIZE){
            const form=new FormData()
            form.append('name', name)
            form.append('type', type)
            form.append('lastModifiedDate', new Date().toString())
            form.append('size', size)
            form.append('mediatype', mediatype)
            form.append('uploadmediarequest', uploadMediaRequest)
            form.append('webwx_data_ticket', this.session.webwxDataTicket)
            form.append('pass_ticket', encodeURI(this.session.passTicket))
            form.append('filename', data, {
                filename: name,
                contentType: type,
                knownLength: size
            })
            return [form]
        }
        // 大于0.5mb的文件要切割 chunk
        const totalChunksNum = Math.ceil(size / CHUNK_SIZE)
        const formList = []

        for (let i = 0; i < totalChunksNum; i++) {
            let startPos = i * CHUNK_SIZE
            let endPos = Math.min(size, startPos + CHUNK_SIZE)
            let chunk = data.slice(startPos, endPos)

            // 创建每个块的 FormData
            const form = new FormData()
            form.append('name', name)
            form.append('type', type)
            form.append('lastModifiedDate', new Date().toString())
            form.append('size', size)
            form.append('mediatype', mediatype)
            form.append('uploadmediarequest', uploadMediaRequest)
            form.append('webwx_data_ticket', this.session.webwxDataTicket)
            form.append('pass_ticket', encodeURI(this.session.passTicket))
            form.append('id', 'WU_FILE_0')
            form.append('chunk', i)
            form.append('chunks', totalChunksNum)
            form.append('filename', chunk, {
                filename: name,
                contentType: type,
                knownLength: chunk.length
            })
            formList.push(form)
        }

        return formList
    }
    async getAvatar(avatar:string){
        const result=await this.request.get(avatar,{
            responseType:'arraybuffer'
        }).catch((e)=>{
            this.emit('internal.verbose',e,'debug')
            throw new Error('获取视频失败')
        })
        return {
            data:result.data,
            type:result.headers['content-type']
        }
    }
    async batchGetContact(contactIds:string[]){
        if(!contactIds.length) return
        const {data}=await this.request.post('/cgi-bin/mmwebwx-bin/webwxbatchgetcontact',{
            'BaseRequest': this.getBaseRequest(),
            'Count': contactIds.length,
            'List': contactIds.map((UserName)=>({UserName}))
        },{
            params:{
                'pass_ticket': this.session.passTicket,
                'type': 'ex',
                'r': +new Date(),
                'lang': 'zh_CN'
            }
        })
        if(data.BaseResponse.Ret!==0){
            this.emit('internal.verbose',contactIds,'debug')
            throw new Error('批量获取联系人失败')
        }
        this.emit('internal.init',data.ContactList)
    }
    em(event: string, payload: Dict) {
        const eventNames = event.split('.')
        const [post_type, detail_type, ...sub_type] = eventNames
        Object.assign(payload, {
            post_type,
            [`${post_type}_type`]: detail_type,
            sub_type: sub_type.join('.'),
            ...payload
        })
        let prefix = ''
        while (eventNames.length) {
            let fullEventName = `${prefix}.${eventNames.shift()}`
            if (fullEventName.startsWith('.')) fullEventName = fullEventName.slice(1)
            this.emit(fullEventName, payload)
            prefix = fullEventName
        }
    }
    async getContact():Promise<Contact.OriginalInfo[]>{
        const getContactList =async (seq:number=0)=>{
            const {data}=await this.request.post('/cgi-bin/mmwebwx-bin/webwxgetcontact',undefined,{
                params:{
                    // 'pass_ticket': this.PROP.passTicket,
                    'seq': seq,
                    'skey': this.session.skey,
                    'r': +new Date()
                }
            })
            if(data.BaseResponse.Ret!==0) throw new Error('获取通讯录失败')
            if(!data.Seq) return []
            return data.MemberList.concat(await getContactList(data.Seq))
        }
        return getContactList()
    }
    private async syncCheck(){
        const {data}=await this.request.get<string>('/cgi-bin/mmwebwx-bin/synccheck',{
            baseURL:`https://webpush.${this.config.base_url}`,
            params:{
                'r': +new Date(),
                'sid': this.session.sid,
                'uin': this.uin,
                'skey': this.session.skey,
                'deviceid': getDeviceID(),
                'synckey': this.session.formatedSyncKey||''
            }
        })
        const [_,retcode,selector]=data.match(/\{retcode:"(\d+)",selector:"(\d+)"}/)||['','0','0']
        if(+retcode===SyncRet.Logout) throw alreadyLogoutError
        if(+retcode!==SyncRet.Success) throw new Error('同步失败')
        return +selector
    }
    private async sync(){
        const {data}=await this.request.post('/cgi-bin/mmwebwx-bin/webwxsync',{
            'BaseRequest': this.getBaseRequest(),
            'SyncKey': this.session.syncKey,
            'rr': ~new Date()
        },{
            params:{
                'sid': this.session.sid,
                'skey': this.session.skey,
                'pass_ticket': this.session.passTicket,
                'lang': 'zh_CN'
            }
        })
        if(data.BaseResponse.Ret===SyncRet.Logout) throw alreadyLogoutError
        if(data.BaseResponse.Ret!==SyncRet.Success) throw new Error('获取新信息失败')
        this.updateSyncKey(data)
        this.session.skey=data.Skey||this.session.skey
        return data
    }
    private updateSyncKey (data:Dict) {
        if (data.SyncKey) {
            this.session.syncKey = data.SyncKey
        }
        if (data.SyncCheckKey) {
            let synckeylist = []
            for (let e = data.SyncCheckKey.List, o = 0, n = e.length; n > o; o++) {
                synckeylist.push(e[o]['Key'] + '_' + e[o]['Val'])
            }
            this.session.formatedSyncKey = synckeylist.join('|')
        } else if (!this.session.formatedSyncKey && data.SyncKey) {
            let synckeylist = []
            for (let e = data.SyncKey.List, o = 0, n = e.length; n > o; o++) {
                synckeylist.push(e[o]['Key'] + '_' + e[o]['Val'])
            }
            this.session.formatedSyncKey = synckeylist.join('|')
        }
    }
    async notifyMobile(to?:string){
        const result=await this.request.post('/cgi-bin/mmwebwx-bin/webwxstatusnotify',{
            'BaseRequest': this.getBaseRequest(),
            'Code': to ? 1 : 3,
            'FromUserName': this.info.username,
            'ToUserName': to || this.info.username,
            'ClientMsgId': Date.now()
        },{
            params:{
                pass_ticket: this.session.passTicket,
                lang: 'zh_CN'
            }
        })
    }
    private syncPolling(id = ++this.syncPollingId){
        if (this.status !== Status.Login || this.syncPollingId !== id) {
            return
        }
        this.syncCheck().then((selector) => {
            this.emit('internal.verbose','Sync Check Selector:'+selector,'debug')
            if (selector !==SyncSelector.Normal) {
                return this.sync().then(data => {
                    this.syncErrorCount = 0
                    this.emit('internal.sync',data)
                })
            }
        }).then(() => {
            this.lastSyncTime = Date.now()
            this.retryPollingId = setTimeout(() => this.syncPolling(id), 2000)
        }).catch(err => {
            if (this.status !== Status.Login) {
                return
            }
            this.emit('internal.verbose',err,'error')
            if (err instanceof AlreadyLoggedError) {
                this.emit('internal.stop')
                return
            }
            this.emit('error', err)
            if (++this.syncErrorCount > 2) {
                let err = new Error(`连续${this.syncErrorCount}次同步失败，5s后尝试重启`)
                this.emit('internal.verbose',err,'error')
                this.emit('error', err)
                clearTimeout(this.retryPollingId)
                setTimeout(() => this.init(), 5 * 1000)
            } else {
                clearTimeout(this.retryPollingId)
                this.retryPollingId = setTimeout(() => this.syncPolling(id), 2000 * this.syncErrorCount)
            }
        })
    }
    private checkPolling(){
        if (this.status !== Status.Login) {
            return
        }
        let interval = Date.now() - this.lastSyncTime
        if (interval > 1 * 60 * 1000) {
            this.emit('internal.verbose',`状态同步超过${interval / 1000}s未响应，5s后尝试重启`,'error')
            clearTimeout(this.checkPollingId)
            setTimeout(() => this.init(), 5 * 1000)
        } else {
            this.emit('internal.verbose',`心跳`,'debug')
            this.notifyMobile()
                .catch(err => {
                    this.emit('internal.verbose',err,'error')
                })
            clearTimeout(this.checkPollingId)
            this.checkPollingId = setTimeout(() => this.checkPolling(), 5 * 60 * 1000)
        }
    }
}

export namespace BaseClient {
    export interface Config {
        base_url?: string
        timeout?: number
        data_dir?: string
        log_level?: LogLevel
    }

    export interface Token {
        session:Session,
        cookie:Dict<string>
        base_url:string
        info:Info
    }
    export interface Info{
        uin:number
        username:string
        nickname:string
        avatar:string
        remark:string
        sex:Sex
    }
    export interface OriginalInfo{
        Uin:number
        UserName:string
        NickName:string
        HeadImgUrl:string
        RemarkName:string
        Sex:number
    }
    export interface Session {
        uuid?: string
        skey?:string
        sid?:string
        syncKey?:string
        passTicket?:string
        formatedSyncKey?:string
        webwxDataTicket?:string
    }
}
