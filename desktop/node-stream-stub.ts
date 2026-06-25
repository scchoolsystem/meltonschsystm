export class Readable {}
export class Writable {}
export class PassThrough extends Writable {}
export class Transform extends PassThrough {}
export default { Readable, Writable, PassThrough, Transform };
