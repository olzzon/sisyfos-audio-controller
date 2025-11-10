
export interface Command {
    name: string,
    value?: string
}
export interface InputsPreset {
    inputNumbers: number[]
    /** vMix commands to execute for each input */
    commands: Command[]
    /** whether channel matrix (and channel mixer) should be reset */
    resetChannelMatrix?: boolean
    /** whether channel gain should be set to 0 */
    resetGain?: boolean
    /** whether "LR" channels of an input should be linked in Sisyfos */
    linkSeparateMono?: boolean
}
export type Preset = InputsPreset[]
