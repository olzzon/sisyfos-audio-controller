import {
    VMixMixerProtocol,
    FxParam,
    MixerConnectionTypes,
    emptyMixerMessage,
} from '../MixerProtocolInterface'

export const VMix: VMixMixerProtocol = {
    protocol: MixerConnectionTypes.vMix,
    fxList: FxParam,
    label: 'VMix Audio Control',

    // Hardcoded LR preset name
    lrPreset: 'LR',

    // we support custom presets defined in json, with a *.vmix.json extension, used
    // in order not to confuse them with *.vmix files, which are vMix presets that we definitely don't want to restore
    presetFileExtension: 'vmix.json',
    loadPresetCommand: [
        emptyMixerMessage(),
    ],
    MAX_UPDATES_PER_SECOND: 10,
    leadingZeros: true,
    pingCommand: [],
    pingTime: 9500,
    initializeCommands: [
        {
            mixerMessage: 'SetVolume',
        },
        {
            mixerMessage: 'AudioAutoOff',
        },
    ],
    channelTypes: [
        {
            channelTypeName: 'CH',
            channelTypeColor: '#2f2f2f',
            fromMixer: {
                CHANNEL_OUT_GAIN: [
                    {
                        mixerMessage: 'SetVolume',
                    },
                ],
                CHANNEL_VU: [
                    emptyMixerMessage(),
                    emptyMixerMessage(),
                ],
                CHANNEL_INPUT_GAIN: [
                    {
                        mixerMessage: 'SetGain',
                        minLabel: 0,
                        maxLabel: 24,
                        label: 'Gain Trim',
                        valueLabel: ' dB',
                    },
                ],
                AUX_LEVEL: [
                    emptyMixerMessage(),
                ],
                CHANNEL_MUTE_ON: [
                    emptyMixerMessage(),
                ],
            },
            toMixer: {
                CHANNEL_OUT_GAIN: [
                    {
                        mixerMessage: 'SetVolume',
                    },
                ],
                CHANNEL_INPUT_SELECTOR: [
                    {
                        mixerMessage: 'AudioChannelMatrixApplyPreset',
                        label: 'Stereo',
                        value: 'Default',
                    },
                    {
                        mixerMessage: 'AudioChannelMatrixApplyPreset',
                        label: 'LL',
                        value: 'LL',
                    },
                    {
                        mixerMessage: 'AudioChannelMatrixApplyPreset',
                        label: 'RR',
                        value: 'RR',
                    },
                    {
                        mixerMessage: 'AudioChannelMatrixApplyPreset',
                        label: 'Mono',
                        value: 'DualMono',
                    },
                ],
                CHANNEL_INPUT_GAIN: [
                    {
                        mixerMessage: 'SetGain',
                        minLabel: 0,
                        maxLabel: 24,
                        label: 'Gain Trim',
                        valueLabel: ' dB',
                        min: 0,
                        max: 24,
                    },
                ],
                CHANNEL_MUTE_ON: [
                    {
                        mixerMessage: 'AudioOff',
                        value: 0,
                        type: 'f',
                    },
                ],
                CHANNEL_MUTE_OFF: [
                    {
                        mixerMessage: 'AudioOn',
                        value: 1,
                        type: 'f',
                    },
                ],
                PFL_OFF: [
                    {
                        mixerMessage: 'SoloOff'
                    },
                ],
                PFL_ON: [
                    {
                        mixerMessage: 'SoloOn',
                    },
                ],
                AUX_LEVEL: [
                    emptyMixerMessage(),
                ],
            },
        },
    ],
    fader: {
        min: 0,
        max: 1,
        zero: 0.75,
        step: 0.01,
    },
    meter: {
        min: 0,
        max: 1,
        zero: 0.75,
        test: 0.6,
    },
}
