import {Image} from "./image";
import {Sendable} from "./elements";
import {MemberInfo} from "../core/member";

export class Converter{
    is_chain = true
    elems: Record<string, any>[] = []
    rich: Record<string, any>=[]
    /** 长度(字符) */
    length = 0
    /** 包含的图片(可能需要上传) */
    imgs: Image[] = []
    /** 预览文字 */
    brief = ""
    /** 分片后 */
    private fragments: Uint8Array[] = []
    constructor(content:Sendable,ext:ConverterExt) {
    }

}
export interface ConverterExt {
    /** 是否是私聊(default:false) */
    dm?: boolean,
    /** 网络图片缓存路径 */
    cachedir?: string,
    /** 群员列表(用于AT时查询card) */
    mlist?: Map<string, MemberInfo>
}
