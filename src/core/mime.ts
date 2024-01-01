import {Dict} from "@/types";

export class Mime{
    types:Dict<string>={}
    extensions:Dict<string>={}
    static defaultType='text/plain'
    static defaultExtension='txt'
    constructor() {
        this.register("*/*", "*");
        this.register("text/html", "html htm xhtml");
        this.register("text/plain", "txt");
        this.register("application/javascript", "js");
        this.register("text/css", "css");
        this.register("text/calendar", "ics");
        this.register("text/csv", "csv");

        this.register("image/png", "png");
        this.register("image/jpeg", "jpeg jpg");
        this.register("image/gif", "gif");
        this.register("image/bmp", "bmp");
        this.register("image/x-icon", "ico");
        this.register("image/tiff", "tiff tif");
        this.register("image/svg+xml", "svg");

        this.register("video/mpeg", "mpg mpeg mpe");

        this.register("application/xml", "xml");
        this.register("application/rss+xml", "rss");
        this.register("application/atom+xml", "atom");
        this.register("application/x-yaml", "yaml");

        this.register("multipart/form-data", "multipart_form");
        this.register("application/x-www-form-urlencoded", "url_encoded_form");

        this.register("application/x-font-ttf", "ttf");
        this.register("application/x-font-truetype", "ttf");
        this.register("application/x-font-opentype", "otf");
        this.register("application/font-woff", "woff");
        this.register("application/vnd.ms-fontobject", "eot");

        this.register("application/json", "map");
        this.register("application/json", "json");
        this.register("application/pdf", "pdf");
        this.register("application/zip", "zip");
    }
    register(type:string,exts:string|string[]){
        let types = this.types,
            extensions = this.extensions,
            ext:string,
            i:number;
        if(!Array.isArray(exts))exts = exts.split(/[ ,]+/)

        for (i = exts.length; i--;) {
            ext = exts[i];
            if (!ext.length) continue;
            if (!extensions[ext]) extensions[ext] = type;
        }

        if (!types[type] && exts[0]) types[type] = exts[0];

        return this;
    }
    lookup(ext:string,fallback:string=Mime.defaultType){
        const type = this.extensions[ext];
        return type ? type : fallback
    }
}
export default new Mime
