# iso-box-reader

A lightweight TypeScript parser for ISO Base Media File Format (ISO BMFF / fMP4) containers.

## Installation

```bash
npm install iso-box-reader
```

## Usage

```typescript
import { IsoBoxReader } from 'iso-box-reader';

// Parse an MP4/fMP4 file
const arrayBuffer = /* your ArrayBuffer */;
const isoFile = IsoBoxReader(arrayBuffer);

// Access parsed boxes
console.log(isoFile.boxes);
```

## API

### `IsoBoxReader(arrayBuffer: ArrayBuffer): ISOFile`

Main entry point. Parses an ISO BMFF container from an ArrayBuffer.

### `ISOFile`

- `boxes: ISOBox[]` — Array of parsed top-level boxes
- `incomplete: boolean` — True if parsing was incomplete

### `ISOBox`

- `fields.type: string` — Box type (e.g., 'moov', 'mdat')
- `fields.size: number` — Box size in bytes
- `boxes: ISOBox[]` — Child boxes (for container boxes)
- `getData(): Uint8Array | undefined` — Raw box data

### `ISOCursor`

Internal cursor for tracking parse position.

## Supported Boxes

Container boxes: `dinf`, `edts`, `mdia`, `meco`, `mfra`, `minf`, `moof`, `moov`, `mvex`, `stbl`, `strk`, `traf`, `trak`, `tref`, `udta`, `vttc`, `sinf`, `schi`, `encv`, `enca`

Special parsing: `mdhd`, `prft`

## License

MIT