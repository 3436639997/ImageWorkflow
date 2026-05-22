export namespace cache {
	
	export class CacheItem {
	    filename: string;
	    group: string;
	    size: number;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new CacheItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filename = source["filename"];
	        this.group = source["group"];
	        this.size = source["size"];
	        this.updatedAt = source["updatedAt"];
	    }
	}

}

export namespace job {
	
	export class Job {
	    job_id: string;
	    kind: string;
	    product_id: string;
	    options?: Record<string, any>;
	    status: string;
	    created_at: string;
	    started_at?: string;
	    finished_at?: string;
	    error?: string;
	    result?: Record<string, any>;
	    log_path?: string;
	
	    static createFrom(source: any = {}) {
	        return new Job(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.job_id = source["job_id"];
	        this.kind = source["kind"];
	        this.product_id = source["product_id"];
	        this.options = source["options"];
	        this.status = source["status"];
	        this.created_at = source["created_at"];
	        this.started_at = source["started_at"];
	        this.finished_at = source["finished_at"];
	        this.error = source["error"];
	        this.result = source["result"];
	        this.log_path = source["log_path"];
	    }
	}

}

export namespace output {
	
	export class OutputFile {
	    id: string;
	    filename: string;
	    kind: string;
	    size: number;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new OutputFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.filename = source["filename"];
	        this.kind = source["kind"];
	        this.size = source["size"];
	        this.updatedAt = source["updatedAt"];
	    }
	}

}

export namespace product {
	
	export class DetectColorsResult {
	    colors: string[];
	    hero_color: string;
	
	    static createFrom(source: any = {}) {
	        return new DetectColorsResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.colors = source["colors"];
	        this.hero_color = source["hero_color"];
	    }
	}
	export class Product {
	    product_id: string;
	    name: string;
	    category: string;
	    description: string;
	    keywords: string;
	    colors_text: string;
	    hero_color: string;
	    color_image_map: string;
	    detail_image_count: number;
	    notes: string;
	    image_count: number;
	    has_plan: boolean;
	    output_count: number;
	
	    static createFrom(source: any = {}) {
	        return new Product(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.product_id = source["product_id"];
	        this.name = source["name"];
	        this.category = source["category"];
	        this.description = source["description"];
	        this.keywords = source["keywords"];
	        this.colors_text = source["colors_text"];
	        this.hero_color = source["hero_color"];
	        this.color_image_map = source["color_image_map"];
	        this.detail_image_count = source["detail_image_count"];
	        this.notes = source["notes"];
	        this.image_count = source["image_count"];
	        this.has_plan = source["has_plan"];
	        this.output_count = source["output_count"];
	    }
	}
	export class ProductImage {
	    filename: string;
	    size: number;
	
	    static createFrom(source: any = {}) {
	        return new ProductImage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filename = source["filename"];
	        this.size = source["size"];
	    }
	}
	export class ProductDetail {
	    product_id: string;
	    name: string;
	    category: string;
	    description: string;
	    keywords: string;
	    colors_text: string;
	    hero_color: string;
	    color_image_map: string;
	    detail_image_count: number;
	    notes: string;
	    image_count: number;
	    has_plan: boolean;
	    output_count: number;
	    images: ProductImage[];
	
	    static createFrom(source: any = {}) {
	        return new ProductDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.product_id = source["product_id"];
	        this.name = source["name"];
	        this.category = source["category"];
	        this.description = source["description"];
	        this.keywords = source["keywords"];
	        this.colors_text = source["colors_text"];
	        this.hero_color = source["hero_color"];
	        this.color_image_map = source["color_image_map"];
	        this.detail_image_count = source["detail_image_count"];
	        this.notes = source["notes"];
	        this.image_count = source["image_count"];
	        this.has_plan = source["has_plan"];
	        this.output_count = source["output_count"];
	        this.images = this.convertValues(source["images"], ProductImage);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace settings {
	
	export class ModelResult {
	    ok: boolean;
	    models: string[];
	    message: string;
	
	    static createFrom(source: any = {}) {
	        return new ModelResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.models = source["models"];
	        this.message = source["message"];
	    }
	}
	export class PresetMeta {
	    id: string;
	    label: string;
	    is_active: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PresetMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.is_active = source["is_active"];
	    }
	}
	export class ProbeResult {
	    ok: boolean;
	    statusCode: number;
	    message: string;
	    modelCount: number;
	
	    static createFrom(source: any = {}) {
	        return new ProbeResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.statusCode = source["statusCode"];
	        this.message = source["message"];
	        this.modelCount = source["modelCount"];
	    }
	}
	export class SettingItem {
	    key: string;
	    value: string;
	    secret: boolean;
	    hasValue: boolean;
	    group: string;
	
	    static createFrom(source: any = {}) {
	        return new SettingItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.value = source["value"];
	        this.secret = source["secret"];
	        this.hasValue = source["hasValue"];
	        this.group = source["group"];
	    }
	}

}

export namespace style {
	
	export class Style {
	    id: string;
	    name: string;
	    prompt: string;
	    reference_images: string[];
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new Style(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.prompt = source["prompt"];
	        this.reference_images = source["reference_images"];
	        this.created_at = source["created_at"];
	    }
	}
	export class StyleInput {
	    name: string;
	    prompt: string;
	
	    static createFrom(source: any = {}) {
	        return new StyleInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.prompt = source["prompt"];
	    }
	}

}

export namespace system {
	
	export class RuntimeInfo {
	    goVersion: string;
	    goos: string;
	    goarch: string;
	    fileServerPort: number;
	
	    static createFrom(source: any = {}) {
	        return new RuntimeInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.goVersion = source["goVersion"];
	        this.goos = source["goos"];
	        this.goarch = source["goarch"];
	        this.fileServerPort = source["fileServerPort"];
	    }
	}

}

