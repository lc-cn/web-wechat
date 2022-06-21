export type Sendable = string | MessageElem
export type MessageElem = TextElem | ImageElem | XmlElem | VideoElem | UrlElem | MpElem
export type TextElem={
    type:'text'
    content:string
    at?:string[]
}
export type ImageElem={
    type:'image'
    image:string|Buffer
}
export type RecordElem={
    type:'record'
}
export type XmlElem={
    type:'xml'
    xml:string
}
export type VideoElem={
    type:'video'
    video?:string|Buffer
    url?:string
}
export type UrlElem={
    type:'url'
    title:string
    desc:string
    url:string
    thumb_url:string
}
export type MpElem={
    type:'mp'
    title:string
    id:string
    user_name:string
    display_name:string
    icon_url:string
    page_path?:string
    thumb_url:string
}
export type MessageRet={
    message_id:string
}
