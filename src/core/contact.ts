import {EventEmitter} from "events";
import {Client} from "../client";
import {lock} from "../common";
import * as path from "path";
import {MessageElem, Sendable, VideoElem} from "../message";
import {Converter} from "../message";
import {ApiRejection} from "./baseClient";
import {Image} from "../message";

export interface ContactInfo{

}
export abstract class Contactable extends EventEmitter{
    /** 对方微信号 */
    protected uid?: string
    /** 对方群号 */
    protected gid?: string
    private get target() {
        return this.uid || this.gid
    }
    // 是否是 Direct Message (私聊)
    private get dm() {
        return !!this.uid
    }
    /** 返回所属的客户端对象 */
    get client() {
        return this.c
    }
    constructor(protected readonly c:Client) {
        super();
        lock(this,'c')
    }
    /** 发消息预处理 */
    protected async _preprocess(content: Sendable) {
        try {
            if ((content as MessageElem).type === "video")
                content = await this.uploadVideo(content[0] as VideoElem)
            const converter = new Converter(content, {
                dm: this.dm,
                cachedir: path.join(this.c.config.data_dir, "../image"),
                mlist: this.c.gml.get(this.gid!)
            })
            if (converter.imgs.length)
                await this.uploadImages(converter.imgs)
            return converter
        } catch (e) {
            // drop(ErrorCode.MessageBuilderError, e.message)
            throw new ApiRejection(e.code, e.message)
        }
    }
    async uploadVideo(elem:VideoElem) {
        return elem
    }
    async uploadImages(imgs:Image[]){

    }
}
