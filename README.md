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

## Supported Boxes

Container boxes: `dinf`, `edts`, `mdia`, `meco`, `mfra`, `minf`, `moof`, `moov`, `mvex`, `stbl`, `strk`, `traf`, `trak`, `tref`, `udta`, `vttc`, `sinf`, `schi`, `encv`, `enca`

Special parsing: `mdhd`, `prft`

## PRFT Calculation Example

```typescript
// 1. Get timescale from mdhd box (init segment)
const initBoxes = IsoBoxReader(initArrayBuffer);
const mdhd = initBoxes.boxes
  .find(box => box.fields.type === 'moov')
  ?.boxes.find(box => box.fields.type === 'trak')
  ?.boxes.find(box => box.fields.type === 'mdia')
  ?.boxes.find(box => box.fields.type === 'mdhd')?.fields as { timescale: number };

// 2. Get prft box from media chunk
const chunkBoxes = IsoBoxReader(chunkArrayBuffer);
const prft = chunkBoxes.boxes.find(box => box.fields.type === 'prft')?.fields as {
  ntpTimestampSec: number;
  ntpTimestampFrac: number;
  mediaTime: number;
};

// 3. Calculate wallclock time
const NTP_EPOCH = new Date(Date.UTC(1900, 0, 1, 0, 0, 0)).getTime();
const ntpTimeMs = prft.ntpTimestampSec * 1000 + (prft.ntpTimestampFrac / 2 ** 32) * 1000;
const wallClockTime = NTP_EPOCH + ntpTimeMs;

// 4. Calculate program start date
const mediaTimeMs = (prft.mediaTime / mdhd.timescale) * 1000;
const programStartDate = new Date(wallClockTime - mediaTimeMs);
```

## License

MIT