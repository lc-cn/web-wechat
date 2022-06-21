import * as fs from "fs";
import { PNG } from "pngjs"
import * as os from "os";
import * as stream from "stream";
import * as crypto from "crypto";
// 同步读取文件
export function readFileSync(file:string){
    const result=fs.readFileSync(file).toString()
    try{
        return JSON.parse(result);
    }catch {
        return result;
    }
}
// 同步写文件
export function writeFileSync<D extends any>(file:string,data:D){
    fs.writeFileSync(file,JSON.stringify(data,null,2));
}

/** 计算流的md5 */
export function md5Stream(readable: stream.Readable) {
    return new Promise((resolve, reject) => {
        readable.on("error", reject)
        readable.pipe(
            crypto.createHash("md5")
                .on("error", reject)
                .on("data", resolve)
        )
    }) as Promise<Buffer>
}

/** 计算文件的md5和sha */
export function fileHash(filepath: string) {
    const readable = fs.createReadStream(filepath)
    const sha = new Promise((resolve, reject) => {
        readable.on("error", reject)
        readable.pipe(
            crypto.createHash("sha1")
                .on("error", reject)
                .on("data", resolve)
        )
    }) as Promise<Buffer>
    return Promise.all([md5Stream(readable), sha])
}

// 同步创建目录
export function findOrCreateDirSync(dir:string){
    if(!fs.existsSync(dir)){
        fs.mkdirSync(dir,{recursive:true})
    }
}
export function removeFileSync(file:string){
    if(fs.existsSync(file)){
        fs.unlinkSync(file)
    }
}
// 同步创建文件
export function findOrCreateFileSync(file:string,data?:any):boolean{
    if(typeof data!=='string')data=JSON.stringify(data)
    if(!fs.existsSync(file)){
        fs.writeFileSync(file,data||'')
        return true
    }
    return false
}
// 合并对象/数组
export function deepMerge<T extends any>(base:T,...from:T[]):T{
    if(from.length===0){
        return base
    }
    if(typeof base!=='object'){
        return base
    }
    if(Array.isArray(base)){
        return base.concat(...from) as T
    }
    for (const item of from){
        for(const key in item){
            if(base.hasOwnProperty(key)){
                if(typeof base[key]==='object'){
                    base[key]=deepMerge(base[key],item[key])
                }else{
                    base[key]=item[key]
                }
            }else{
                base[key]=item[key]
            }
        }
    }
    return base
}
// 创建指定长度的uuid
export function randomUUID(length:number=32){
    let result=''
    for(let i=0;i<length;i++){
        result+=Math.floor(Math.random()*16).toString(16)
    }
    return result
}
// 打印登录二维码
export function logQrcode(img: Buffer) {
    const png = PNG.sync.read(img)
    const color_reset = "\x1b[0m"
    const color_fg_blk = "\x1b[30m"
    const color_bg_blk = "\x1b[40m"
    const color_fg_wht = "\x1b[37m"
    const color_bg_wht = "\x1b[47m"
    for (let i = 36; i < png.height * 4 - 36; i += 24) {
        let line = ""
        for (let j = 36; j < png.width * 4 - 36; j += 12) {
            let r0 = png.data[i * png.width + j]
            let r1 = png.data[i * png.width + j + (png.width * 4 * 3)]
            let bgcolor = (r0 == 255) ? color_bg_wht : color_bg_blk
            let fgcolor = (r1 == 255) ? color_fg_wht : color_fg_blk
            line += `${fgcolor + bgcolor}\u2584`
        }
        console.log(line + color_reset)
    }
}

/** 隐藏并锁定一个属性 */
export function lock(obj: any, ...props:string[]) {
    for (const prop of props) {
        Reflect.defineProperty(obj, prop, {
            configurable: false,
            enumerable: false,
            writable: false,
        })
    }
}

/** 隐藏一个属性 */
export function hide(obj: any, ...props: string[]) {
    for (const prop of props) {
        Reflect.defineProperty(obj, prop, {
            configurable: false,
            enumerable: false,
            writable: true,
        })
    }
}
export const IS_WIN = os.platform() === "win32"

/** 系统临时目录，用于临时存放下载的图片等内容 */
export const TMP_DIR = os.tmpdir()

/** 最大上传和下载大小，以图片上传限制为准：30MB */
export const MAX_UPLOAD_SIZE = 31457280

/** 用于下载限量 */
export class DownloadTransform extends stream.Transform {
    _size = 0
    _transform(data: Buffer, encoding: BufferEncoding, callback: stream.TransformCallback) {
        this._size += data.length
        let error = null
        if (this._size <= MAX_UPLOAD_SIZE)
            this.push(data)
        else
            error = new Error("downloading over 30MB is refused")
        callback(error)
    }
}

export function uuid() {
    let hex = crypto.randomBytes(16).toString("hex")
    return hex.substr(0, 8) + "-" + hex.substr(8, 4) + "-" + hex.substr(12, 4) + "-" + hex.substr(16, 4) + "-" + hex.substr(20)
}
export * from './core/constants'


