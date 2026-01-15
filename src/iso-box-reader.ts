/* eslint-disable no-bitwise */

export class ISOCursor {
    private _offset: number;

    constructor(initialOffset: number = 0) {
        if (typeof initialOffset !== 'number') {
            throw new Error('Initial offset must be a number');
        }
        this._offset = initialOffset;
    }

    get offset(): number {
        return this._offset;
    }

    set offset(value: number) {
        if (typeof value === 'number') {
            this._offset = value;
        } else {
            throw new Error('Offset must be a number');
        }
    }
}
export class ISOBox {
    private offset: number;
    // TODO: unused
    // private parent: ISOFile | ISOBox;
    private largesize: number;
    cursor: ISOCursor;
    root: ISOFile;
    raw: DataView;
    boxes: ISOBox[];
    boxContainers: string[];
    boxProcessors: { [type: string]: () => void };
    incomplete: boolean;
    fields: { [key: string]: number | string | Uint8Array | undefined };
    private data?: Uint8Array;
    constructor() {
        this.cursor = new ISOCursor();
        this.boxContainers = [
            'dinf',
            'edts',
            'mdia',
            'meco',
            'mfra',
            'minf',
            'moof',
            'moov',
            'mvex',
            'stbl',
            'strk',
            'traf',
            'trak',
            'tref',
            'udta',
            'vttc',
            'sinf',
            'schi',
            'encv',
            'enca',
        ];
        this.boxProcessors = {};
        this.fields = {};
    }

    static parse(parent: ISOFile | ISOBox): ISOBox {
        const newBox = new ISOBox();
        newBox.offset = parent.cursor.offset;
        newBox.root = parent.root || parent;
        newBox.raw = parent.raw;
        // TODO: unused never read
        // newBox.parent = parent;
        newBox.parseBox();
        parent.cursor.offset = newBox.raw.byteOffset + newBox.raw.byteLength;
        return newBox;
    }

    getData(): Uint8Array | undefined {
        return this.data;
    }

    parseBox(): void {
        this.cursor.offset = this.offset;

        // return immediately if there are not enough bytes to read the header
        if (this.offset + 8 > this.raw.buffer.byteLength) {
            this.root.incomplete = true;
            return;
        }

        this.procField('size', 'uint', 32);
        this.procField('type', 'string', 4);

        if (this.fields.size === 1) {
            this.procField('largesize', 'uint', 64);
        }

        switch (this.fields.size) {
            case 0:
                // Size zero indicates last box in the file. Consume remaining buffer.
                this.raw = new DataView(this.raw.buffer, this.offset);
                break;
            case 1:
                if (this.offset + this.fields.size > this.raw.buffer.byteLength) {
                    this.incomplete = true;
                    this.root.incomplete = true;
                } else {
                    this.raw = new DataView(this.raw.buffer, this.offset, this.largesize);
                }
                break;
            default:
                if (this.offset + Number(this.fields.size) > this.raw.buffer.byteLength) {
                    this.incomplete = true;
                    this.root.incomplete = true;
                } else {
                    this.raw = new DataView(this.raw.buffer, this.offset, Number(this.fields.size));
                }
        }

        // additional parsing
        if (!this.incomplete) {
            if (this.fields.type === 'mdhd') {
                this.parseMDHD();
            }
            if (this.fields.type === 'prft') {
                this.parsePRFT();
            }
            if (this.boxContainers.includes(String(this.fields.type))) {
                this.parseContainerBox();
            } else {
                // Unknown box => read and store box content
                this.data = this.readData();
            }
        }
    }

    procField(name: string, type: string, size: number): void {
        this.fields[name] = this.readField(type, size);
    }

    procFullBox(): void {
        this.procField('version', 'uint', 8);
        this.procField('flags', 'uint', 24);
    }

    parseContainerBox(): void {
        this.boxes = [];
        while (this.cursor.offset - this.raw.byteOffset < this.raw.byteLength) {
            this.boxes.push(ISOBox.parse(this));
        }
    }

    // ISO/IEC 14496-12:2012 - 8.4.2 Media Header Box
    parseMDHD(): void {
        this.procFullBox();
        this.procField('creation_time', 'uint', this.fields.version === 1 ? 64 : 32);
        this.procField('modification_time', 'uint', this.fields.version === 1 ? 64 : 32);
        this.procField('timescale', 'uint', 32);
        this.procField('duration', 'uint', this.fields.version === 1 ? 64 : 32);
        this.procField('language', 'uint', 16);
        this.procField('pre_defined', 'uint', 16);
    }

    // ISO/IEC 14496-12:2012 - 8.16.5 Producer Reference Time
    parsePRFT(): void {
        this.procFullBox();
        this.procField('reference_track_ID', 'uint', 32);
        this.procField('ntpTimestampSec', 'uint', 32);
        this.procField('ntpTimestampFrac', 'uint', 32);
        this.procField('mediaTime', 'uint', this.fields.version === 1 ? 64 : 32);
    }

    readField(type: string, size: number): number | string | Uint8Array | undefined {
        switch (type) {
            case 'uint':
                return this.readUint(size);
            case 'int':
                return this.readInt(size);
            case 'template':
                return this.readTemplate(size);
            case 'string':
                return size === -1 ? this.readTerminatedString() : this.readString(size);
            case 'data':
                return this.readData(size);
            default:
                return -1;
        }
    }

    readData(size?: number): Uint8Array | undefined {
        const length = size || this.raw.byteLength - (this.cursor.offset - this.offset);
        if (length) {
            const data = new Uint8Array(this.raw.buffer, this.cursor.offset, length);

            this.cursor.offset += length;
            return data;
        }
        return undefined;
    }

    readUint(size: number): number | undefined {
        let result: number | undefined;
        let s1: number;
        let s2: number;
        const offset = this.cursor.offset - this.raw.byteOffset;
        switch (size) {
            case 8:
                result = this.raw.getUint8(offset);
                break;
            case 16:
                result = this.raw.getUint16(offset);
                break;
            case 24:
                s1 = this.raw.getUint16(offset);
                s2 = this.raw.getUint8(offset + 2);
                result = (s1 << 8) + s2;
                break;
            case 32:
                result = this.raw.getUint32(offset);
                break;
            case 64:
                // Warning: JavaScript cannot handle 64-bit integers natively.
                // This will give unexpected results for integers >= 2^53
                s1 = this.raw.getUint32(offset);
                s2 = this.raw.getUint32(offset + 4);
                result = s1 * Math.pow(2, 32) + s2;
                break;
            default:
                result = undefined;
        }
        this.cursor.offset += size >> 3;
        return result;
    }

    readInt(size: number): number | undefined {
        let result: number | undefined;
        let s1: number;
        let s2: number;
        const offset = this.cursor.offset - this.raw.byteOffset;
        switch (size) {
            case 8:
                result = this.raw.getInt8(offset);
                break;
            case 16:
                result = this.raw.getInt16(offset);
                break;
            case 32:
                result = this.raw.getInt32(offset);
                break;
            case 64:
                // Warning: JavaScript cannot handle 64-bit integers natively.
                // This will give unexpected results for integers >= 2^53
                s1 = this.raw.getInt32(offset);
                s2 = this.raw.getInt32(offset + 4);
                result = s1 * Math.pow(2, 32) + s2;
                break;
        }
        this.cursor.offset += size >> 3;
        return result;
    }

    readTemplate(size: number): number {
        const pre = this.readUint(size / 2);
        const post = this.readUint(size / 2);
        return Number(pre) + Number(post) / Math.pow(2, size / 2);
    }

    readTerminatedString(): string {
        let str = '';
        while (this.cursor.offset - this.offset < this.raw.byteLength) {
            const char = this.readUint(8);
            if (char === 0) break;
            str += String.fromCharCode(Number(char));
        }
        return str;
    }

    readString(length: number): string {
        let str = '';
        for (let c = 0; c < length; c++) {
            const char = this.readUint(8);
            str += String.fromCharCode(Number(char));
        }
        return str;
    }
}
export class ISOFile {
    cursor: ISOCursor;
    raw: DataView;
    boxes: ISOBox[];
    root: ISOFile;
    incomplete: boolean;
    constructor(arrayBuffer: ArrayBuffer) {
        this.cursor = new ISOCursor();
        this.boxes = [];
        if (arrayBuffer) {
            this.raw = new DataView(arrayBuffer);
        }
    }

    parse(): ISOFile {
        this.cursor.offset = 0;
        this.boxes = [];
        while (this.cursor.offset < this.raw.byteLength) {
            const box = ISOBox.parse(this);

            // Box could not be parsed
            if (!box?.fields.type) {
                break;
            }

            this.boxes.push(box);
        }
        return this;
    }
}
export const IsoBoxReader = (arrayBuffer: ArrayBuffer): ISOFile => {
    if (!(arrayBuffer instanceof ArrayBuffer)) {
        throw new Error('Invalid parameter. Expecting an ArrayBuffer.');
    }

    const isoFile = new ISOFile(arrayBuffer);

    try {
        isoFile.parse();
    } catch (err) {
        throw new Error(`Invalid ISO file. ${(err as Error)?.message || err}`);
    }

    return isoFile;
};
