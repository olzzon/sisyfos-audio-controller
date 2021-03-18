import { IMixerProtocol } from '../MixerProtocolInterface'

export const ArdourMaster: IMixerProtocol = {
    protocol: 'OSC',
    label: 'Ardour DAW - Master Mode',
    presetFileExtension: '',
    FADE_DISPATCH_RESOLUTION: 5,
    leadingZeros: false,
    pingCommand: [
        {
            mixerMessage: '/strip/list',
            value: 0,
            type: 'i',
            min: 0,
            max: 1,
            zero: 0.75,
        },
    ],
    pingResponseCommand: [
        {
            mixerMessage: '/strip/list',
            value: 0,
            type: 'i',
            min: 0,
            max: 1,
            zero: 0.75,
        },
    ],
    pingTime: 9500,
    initializeCommands: [
        {
            mixerMessage: '/set_surface/feedback',
            value: '135',
            type: 'i',
            min: 0,
            max: 1,
            zero: 0.75,
        },
    ],
    channelTypes: [
        {
            channelTypeName: 'CH',
            channelTypeColor: '#2f2f2f',
            fromMixer: {
                CHANNEL_OUT_GAIN: [
                    {
                        mixerMessage: '/strip/fader/{channel}',
                        value: 0,
                        type: 'f',
                        min: 0,
                        max: 1,
                        zero: 0.75,
                    },
                ],
                CHANNEL_VU: [
                    {
                        mixerMessage: '/strip/meter/{channel}',
                        value: 0,
                        type: 'f',
                        min: 0,
                        max: 1,
                        zero: 0.75,
                    },
                ],
                CHANNEL_NAME: [
                    {
                        mixerMessage: '/strip/name/{channel}',
                        value: 0,
                        type: 'f',
                        min: 0,
                        max: 1,
                        zero: 0.75,
                    },
                ],
            },
            toMixer: {
                CHANNEL_OUT_GAIN: [
                    {
                        mixerMessage: '/strip/fader/{channel}',
                        value: 0,
                        type: 'f',
                        min: 0,
                        max: 1,
                        zero: 0.75,
                    },
                ],
                CHANNEL_NAME: [
                    {
                        mixerMessage: '/strip/name/{channel}',
                        value: 0,
                        type: 'f',
                        min: 0,
                        max: 1,
                        zero: 0.75,
                    },
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
        zero: 0.85,
        test: 0.75,
    },
}
