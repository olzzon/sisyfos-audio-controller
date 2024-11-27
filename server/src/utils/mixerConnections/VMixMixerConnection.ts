//Node Modules:
import { store, state } from '../../reducers/store'
import { ConnectionTCP } from 'node-vmix'
import { XmlApi } from 'vmix-js-utils'
import fs from 'fs'
import path from 'path'

//Utils:
import {
    FxParam,
    MixerProtocol,
} from '../../../../shared/src/constants/MixerProtocolInterface'
import {
    ChannelActions,
    ChannelActionTypes,
} from '../../../../shared/src/actions/channelActions'
import {
    FaderActions,
    FaderActionTypes,
} from '../../../../shared/src/actions/faderActions'
import {
    SettingsActions,
    SettingsActionTypes,
} from '../../../../shared/src/actions/settingsActions'
import { logger } from '../logger'
import { sendVuLevel } from '../vuServer'
import { VuType } from '../../../../shared/src/utils/vu-server-types'
import { dbToFloat } from './LawoRubyConnection'
import {
    ChannelReference,
    Fader,
} from '../../../../shared/src/reducers/fadersReducer'
import { LinkableMode, MixerConnection } from '.'
import { STORAGE_FOLDER } from '../SettingsStorage'
import { Preset } from './productSpecific/vMixPreset'

enum PrivateDataTag {
    INPUT_NUMBER = 'inputNumber',
    LINKABLE = 'linkable',
}

interface VMixInput {
    name: string
    volume: number
    muted: boolean
    meterF1: number
    meterF2: number
    number: number
    gainDb: number
    solo: boolean
    linkable?: LinkableMode
}

interface VMixInputLocation {
    // input number in vMix
    inputNumber: number
    // if the input is in fact a subchannel (L/R) within an input
    subchannelNumber?: number
    channelType: number
}

const SEPARATE_MONO_MATRIX_PRESET_NAME = 'SeparateMono'
type HackMatrixPreset = `${number}L` | typeof SEPARATE_MONO_MATRIX_PRESET_NAME

export class VMixMixerConnection implements MixerConnection {
    mixerProtocol: MixerProtocol
    mixerIndex: number

    vMixCommandConnection: ConnectionTCP
    /** We use a separate connection for updates to prevent blocking any commands */
    vMixFeedbackConnection: ConnectionTCP
    vMixXmlPollingInterval: NodeJS.Timer

    audioOn: Record<string, boolean> = {}
    lastLevel: Record<string, number> = {}

    lastState: VMixInput[] | undefined

    awaitingFirstXml = true

    constructor(mixerProtocol: MixerProtocol, mixerIndex: number) {
        this.sendOutMessage = this.sendOutMessage.bind(this)
        this.xmlElementToInput = this.xmlElementToInput.bind(this)
        this.updateInputState = this.updateInputState.bind(this)

        store.dispatch({
            type: SettingsActionTypes.SET_MIXER_ONLINE,
            mixerIndex: this.mixerIndex,
            mixerOnline: false,
        })

        this.mixerProtocol = mixerProtocol
        this.mixerIndex = mixerIndex
        //If default store has been recreated multiple mixers are not created
        if (!state.channels[0].chMixerConnection[this.mixerIndex]) {
            state.channels[0].chMixerConnection[this.mixerIndex] = {
                channel: [],
            }
        }

        this.vMixCommandConnection = new ConnectionTCP(
            state.settings[0].mixers[this.mixerIndex].deviceIp,
            {
                port: parseInt(
                    state.settings[0].mixers[this.mixerIndex].devicePort + '',
                ),
                debug: true,
            },
        )
        this.vMixFeedbackConnection = new ConnectionTCP(
            state.settings[0].mixers[this.mixerIndex].deviceIp,
            {
                port: parseInt(
                    state.settings[0].mixers[this.mixerIndex].devicePort + '',
                ),
            },
        )
        this.setupMixerConnection()
    }

    private setMixerOnlineState(onLineState: boolean) {
        store.dispatch({
            type: SettingsActionTypes.SET_MIXER_ONLINE,
            mixerIndex: this.mixerIndex,
            mixerOnline: onLineState,
        })

        global.mainThreadHandler.updateMixerOnline(this.mixerIndex, onLineState)
    }

    private getAssignedFaderIndex(channelIndex: number) {
        return state.faders[0].fader.findIndex((fader: Fader) =>
            fader.assignedChannels?.some((assigned: ChannelReference) => {
                return (
                    assigned.mixerIndex === this.mixerIndex &&
                    assigned.channelIndex === channelIndex
                )
            }),
        )
    }

    private onReceivedFirstState() {
        this.setMixerOnlineState(true)
        global.mainThreadHandler.updateFullClientStore()
        this.awaitingFirstXml = false
    }

    private setupMixerConnection() {
        this.vMixCommandConnection.on('connect', () => {
            logger.info('Receiving state of desk')
            this.sendInitialCommands()
            this.awaitingFirstXml = true
            // we don't yet set the mixer as online because we want to do that after receiving the initial XML state
        })
        this.vMixCommandConnection.on('error', (error: any) => {
            global.mainThreadHandler.updateFullClientStore()
            logger.error(error)
        })
        this.vMixCommandConnection['_socket'].on('disconnect', () => {
            this.setMixerOnlineState(false)
            logger.info('Lost VMix connection')
        })

        logger.info(
            `OSC listening on port ${
                state.settings[0].mixers[this.mixerIndex].localOscPort
            }`,
        )

        this.vMixFeedbackConnection.on('xml', (xml: string) => {
            if (this.awaitingFirstXml) {
                this.onReceivedFirstState()
            }
            this.handleXml(xml)
        })

        this.vMixFeedbackConnection.on('connect', () => {
            this.vMixXmlPollingInterval = setInterval(() => {
                this.vMixFeedbackConnection.send('XML')
            }, 80)
        })
        this.vMixFeedbackConnection['_socket'].on('disconnect', () => {
            clearInterval(this.vMixXmlPollingInterval)
        })
    }

    private handleXml(xml: string) {
        const doc = XmlApi.DataParser.parse(xml)
        const inputs = XmlApi.Inputs.extractInputsFromXML(doc)

        const mappedInputs: Array<VMixInput> = inputs.flatMap(
            this.xmlElementToInput,
        )

        mappedInputs.forEach(this.updateInputState)

        this.lastState = mappedInputs
    }

    private xmlElementToInput(input: Element) {
        const d: Record<string, any> = {
            name: input.childNodes[0].nodeValue,
        }

        const attrs = [
            'volume',
            'volumeF1',
            'volumeF2',
            'muted',
            'meterF1',
            'meterF2',
            'number',
            'gainDb',
            'solo',
        ]
        Object.values(input.attributes)
            .filter((attr: Attr) => attrs.includes(attr.name))
            .forEach((attr: Attr) => {
                d[attr.name] = attr.value
            })

        d.volume = Math.pow(parseFloat(d.volume || '0') / 100, 0.25)
        d.volumeF1 =
            d.volumeF1 !== undefined
                ? Math.pow(parseFloat(d.volumeF1 || '0'), 0.25)
                : undefined
        d.volumeF2 =
            d.volumeF2 !== undefined
                ? Math.pow(parseFloat(d.volumeF2 || '0'), 0.25)
                : undefined
        d.meterF1 = (9.555 * Math.log(d.meterF1 || 0)) / Math.log(3)
        d.meterF2 = (9.555 * Math.log(d.meterF2 || 0)) / Math.log(3)
        d.muted = d.muted ? d.muted === 'True' : true
        d.solo = d.solo === 'True'
        d.gainDb = parseFloat(d.gainDb || '0') / 24
        d.number = Number(d.number)

        if (d.volumeF1 === undefined) {
            return d
        } else {
            return [
                {
                    ...d,
                    volume: d.volumeF1,
                    meterF2: d.meterF1,
                    linkable: LinkableMode.PRIMARY,
                },
                {
                    ...d,
                    volume: d.volumeF2,
                    meterF1: d.meterF2,
                    linkable: LinkableMode.SECONDARY,
                },
            ]
        }
    }

    private updateInputState(input: VMixInput, channelIndex: number) {
        const lastInputState = this.lastState?.[channelIndex]
        if (
            !state.channels[0].chMixerConnection[this.mixerIndex].channel[
                channelIndex
            ]
        )
            return

        const assignedFaderIndex = this.getAssignedFaderIndex(channelIndex)
        if (!state.faders[0].fader[assignedFaderIndex]) {
            return
        }
        if ('number' in input) {
            this.sendVuLevels(assignedFaderIndex, channelIndex, input)
        }

        // If vMix has more channels than Sisyfos is configured to handle,
        // then do nothing with those additional channels.
        if (!this.doesChannelExists(channelIndex)) {
            return
        }

        const { outputLevel, fadeActive, privateData } =
            state.channels[0].chMixerConnection[this.mixerIndex].channel[
                channelIndex
            ]
        const {
            inputGain,
            muteOn,
            pflOn,
            pgmOn,
            voOn,
            capabilities,
            isLinked,
        } = state.faders[0].fader[assignedFaderIndex]
        let sendUpdate = false

        const dispatchAndSetUpdateState = (
            update: FaderActions | ChannelActions | SettingsActions,
        ) => {
            store.dispatch(update)
            sendUpdate = true
        }

        if ('muted' in input) {
            if (input.muted === false) {
                if (
                    !fadeActive &&
                    outputLevel > 0 &&
                    input.volume !== lastInputState?.volume &&
                    Math.abs(outputLevel - input.volume) > 0.01
                ) {
                    dispatchAndSetUpdateState({
                        type: FaderActionTypes.SET_FADER_LEVEL,
                        faderIndex: assignedFaderIndex,
                        level: input.volume,
                    })
                    dispatchAndSetUpdateState({
                        type: ChannelActionTypes.SET_OUTPUT_LEVEL,
                        channel: assignedFaderIndex,
                        mixerIndex: this.mixerIndex,
                        level: voOn
                            ? input.volume / (state.settings[0].voLevel / 100)
                            : input.volume,
                    })
                }
                if (input.muted !== lastInputState?.muted && muteOn) {
                    dispatchAndSetUpdateState({
                        type: FaderActionTypes.SET_MUTE,
                        faderIndex: assignedFaderIndex,
                        muteOn: false,
                    })
                }
                if (
                    input.muted !== lastInputState?.muted &&
                    !fadeActive &&
                    !pgmOn &&
                    !voOn
                ) {
                    dispatchAndSetUpdateState({
                        type: FaderActionTypes.SET_PGM,
                        faderIndex: assignedFaderIndex,
                        pgmOn: true,
                    })
                    dispatchAndSetUpdateState({
                        type: ChannelActionTypes.SET_OUTPUT_LEVEL,
                        channel: assignedFaderIndex,
                        mixerIndex: this.mixerIndex,
                        level: input.volume,
                    })
                }
            } else if (input.muted !== lastInputState?.muted && !muteOn) {
                if (pgmOn) {
                    dispatchAndSetUpdateState({
                        type: FaderActionTypes.SET_PGM,
                        faderIndex: assignedFaderIndex,
                        pgmOn: false,
                    })
                }
                if (voOn) {
                    dispatchAndSetUpdateState({
                        type: FaderActionTypes.SET_VO,
                        faderIndex: assignedFaderIndex,
                        voOn: false,
                    })
                }
            }

            if (
                input.gainDb !== lastInputState?.gainDb &&
                inputGain !== input.gainDb &&
                input.linkable !== LinkableMode.SECONDARY
            ) {
                dispatchAndSetUpdateState({
                    type: FaderActionTypes.SET_INPUT_GAIN,
                    faderIndex: assignedFaderIndex,
                    level: input.gainDb,
                })
            }
            if (input.solo !== lastInputState?.solo && pflOn !== input.solo) {
                dispatchAndSetUpdateState({
                    type: FaderActionTypes.SET_PFL,
                    faderIndex: assignedFaderIndex,
                    pflOn: input.solo,
                })
            }
            if (
                (input.linkable !== lastInputState?.linkable &&
                    privateData?.[PrivateDataTag.LINKABLE] !==
                        input.linkable) ||
                !isLinked && (capabilities?.isLinkablePrimary !==
                    (input.linkable === LinkableMode.PRIMARY) ||
                capabilities?.isLinkableSecondary !==
                    (input.linkable === LinkableMode.SECONDARY))
            ) {
                dispatchAndSetUpdateState({
                    type: FaderActionTypes.SET_CAPABILITY,
                    faderIndex: assignedFaderIndex,
                    capability: 'isLinkablePrimary',
                    enabled: input.linkable === LinkableMode.PRIMARY,
                })
                dispatchAndSetUpdateState({
                    type: FaderActionTypes.SET_CAPABILITY,
                    faderIndex: assignedFaderIndex,
                    capability: 'isLinkableSecondary',
                    enabled: input.linkable === LinkableMode.SECONDARY,
                })
                dispatchAndSetUpdateState({
                    type: ChannelActionTypes.SET_PRIVATE,
                    channel: channelIndex,
                    mixerIndex: this.mixerIndex,
                    tag: PrivateDataTag.LINKABLE,
                    value: input.linkable,
                })
            }
            if (
                privateData?.[PrivateDataTag.INPUT_NUMBER] !==
                String(input.number)
            ) {
                dispatchAndSetUpdateState({
                    type: ChannelActionTypes.SET_PRIVATE,
                    channel: channelIndex,
                    mixerIndex: this.mixerIndex,
                    tag: PrivateDataTag.INPUT_NUMBER,
                    value: String(input.number),
                })
            }
        }

        if (sendUpdate) {
            global.mainThreadHandler.updatePartialStore(channelIndex)
        }
    }

    private sendVuLevels(
        assignedFaderIndex: number,
        channelIndex: number,
        input: VMixInput,
    ) {
        if (state.faders[0].fader[assignedFaderIndex].isLinked) {
            let vuIndex: number = state.faders[0].fader[
                assignedFaderIndex
            ].assignedChannels?.findIndex((assigned) => {
                return (
                    assigned.mixerIndex === this.mixerIndex &&
                    assigned.channelIndex === channelIndex
                )
            })

            sendVuLevel(
                assignedFaderIndex,
                VuType.Channel,
                vuIndex,
                dbToFloat(input.meterF1 + 12),
            ) // add +15 to convert from dBFS
        } else {
            sendVuLevel(
                assignedFaderIndex,
                VuType.Channel,
                0,
                dbToFloat(input.meterF1 + 12),
            ) // add +15 to convert from dBFS
            if (!input.linkable) {
                sendVuLevel(
                    assignedFaderIndex,
                    VuType.Channel,
                    1,
                    dbToFloat(input.meterF2 + 12),
                )
            }
        }
    }

    private sendInitialCommands() {
        this.vMixCommandConnection.send('XML')
    }

    private sendOutMessage(
        vMixMessage: string,
        inputNumber: number,
        value: string | number,
    ) {
        if (state.settings[0].mixers[this.mixerIndex].mixerOnline) {
            logger.trace(
                `send ${vMixMessage} Input=${inputNumber}&Value=${value}`,
            )
            this.vMixCommandConnection.send({
                Function: vMixMessage,
                Input: inputNumber,
                Value: value,
            })
        }
    }

    updatePflState(channelIndex: number) {
        const { inputNumber, channelType } = this.getInputLocation(channelIndex)
        let { outputLevel } =
            state.channels[0].chMixerConnection[this.mixerIndex].channel[
                channelIndex
            ]

        if (state.faders[0].fader[channelIndex].pflOn === true) {
            if (outputLevel === 0) {
                // this.sendOutMessage('AudioOff', channelTypeIndex + 1,  1, '')
                // this.sendOutMessage('SetVolume', channelTypeIndex + 1,  75, '')
            }
            this.sendOutMessage(
                this.mixerProtocol.channelTypes[channelType].toMixer.PFL_ON[0]
                    .mixerMessage,
                inputNumber,
                this.mixerProtocol.channelTypes[channelType].toMixer.PFL_ON[0]
                    .value,
            )
        } else {
            if (outputLevel === 0) {
                // this.sendOutMessage('SetVolume', channelTypeIndex + 1,  0, '')
                // this.sendOutMessage('AudioOn', channelTypeIndex + 1,  1, '')
            }
            this.sendOutMessage(
                this.mixerProtocol.channelTypes[channelType].toMixer.PFL_OFF[0]
                    .mixerMessage,
                inputNumber,
                this.mixerProtocol.channelTypes[channelType].toMixer.PFL_OFF[0]
                    .value,
            )
        }
    }

    updateMuteState(channelIndex: number, muteOn: boolean) {
        const { inputNumber, channelType } = this.getInputLocation(channelIndex)
        const { outputLevel } =
            state.channels[0].chMixerConnection[this.mixerIndex].channel[
                channelIndex
            ]

        // TODO: perhaps use subchannelNumber to mute individually?

        if (muteOn === true && outputLevel > 0) {
            let mute =
                this.mixerProtocol.channelTypes[channelType].toMixer
                    .CHANNEL_MUTE_ON[0]
            this.sendOutMessage(mute.mixerMessage, inputNumber, mute.value)
        } else if (muteOn === false && outputLevel > 0) {
            let mute =
                this.mixerProtocol.channelTypes[channelType].toMixer
                    .CHANNEL_MUTE_OFF[0]
            this.sendOutMessage(mute.mixerMessage, inputNumber, mute.value)
        }
    }

    updateNextAux(channelIndex: number, level: number) {
        this.updateAuxLevel(
            channelIndex,
            state.settings[0].mixers[this.mixerIndex].nextSendAux - 1,
            level,
        )
    }

    updateInputGain(channelIndex: number, level: number) {
        const { inputNumber, subchannelNumber, channelType } =
            this.getInputLocation(channelIndex)

        const mixerMessage =
            this.mixerProtocol.channelTypes[channelType].toMixer
                .CHANNEL_INPUT_GAIN[0]
        if (mixerMessage.min !== undefined && mixerMessage.max !== undefined) {
            level =
                mixerMessage.min + (mixerMessage.max - mixerMessage.min) * level
        }
        this.sendOutMessage(
            this.appendSubchannelSuffix(
                mixerMessage.mixerMessage,
                subchannelNumber,
            ),
            inputNumber,
            Math.round(level),
        )
    }

    updateInputSelector(channelIndex: number, inputSelected: number) {
        const { inputNumber, channelType } = this.getInputLocation(channelIndex)
        const selector =
            this.mixerProtocol.channelTypes[channelType].toMixer
                .CHANNEL_INPUT_SELECTOR[inputSelected - 1]
        if (selector) {
            const { mixerMessage, value } = selector
            this.sendOutMessage(mixerMessage, inputNumber, value)
        } else {
            this.hack_rearrangeAudioChannels(inputSelected, inputNumber)
        }
    }

    /**
     * This assumes existence of Channel Matrix Presets called "1L"..."8L",
     * where the number indicates which input channel is assigned to the L bus channels,
     * whereas every other channel is assigned to the R channel, e.g.:
     * 1L means channel 1 is assigned to L, and channels 2...8 are assigned to R.
     * It also requires a "SeparateMono" preset, where each input channel is assigned to both L and R outs.
     * Combined with SetVolumeChannelMixer[n] command, it allows for 64 channel combinations.
     */
    private hack_rearrangeAudioChannels(
        inputSelected: number,
        inputNumber: number,
    ) {
        const leftInput = (inputSelected >> 8) & 0xff
        const rightInput = (inputSelected >> 16) & 0xff
        for (let i = 1; i <= 8; ++i) {
            if (i !== leftInput && i !== rightInput) {
                this.sendOutMessage(`SetVolumeChannelMixer${i}`, inputNumber, 0)
            }
        }

        let preset: HackMatrixPreset =
            rightInput === leftInput
                ? SEPARATE_MONO_MATRIX_PRESET_NAME
                : `${leftInput}L`
        this.sendOutMessage(
            `AudioChannelMatrixApplyPreset`,
            inputNumber,
            preset,
        )
        this.sendOutMessage(
            `SetVolumeChannelMixer${leftInput}`,
            inputNumber,
            100,
        )
        if (rightInput !== leftInput) {
            this.sendOutMessage(
                `SetVolumeChannelMixer${rightInput}`,
                inputNumber,
                100,
            )
        }
    }

    updateFx(channelIndex: number, fxParam: FxParam, level: number) {
        return
    }

    updateAuxLevel(channelIndex: number, auxSendIndex: number, level: number) {
        return
    }

    updateFadeIOLevel(channelIndex: number, outputLevel: number) {
        const { inputNumber, subchannelNumber } =
            this.getInputLocation(channelIndex)
        let { muteOn } = state.faders[0].fader[channelIndex]
        outputLevel = Math.round(100 * outputLevel)

        if (this.lastLevel[channelIndex] === outputLevel) {
            return
        }

        this.sendOutMessage(
            this.appendSubchannelSuffix('SetVolume', subchannelNumber),
            inputNumber,
            String(outputLevel),
        )
        this.lastLevel[channelIndex] = outputLevel

        if (!muteOn && outputLevel > 0 && !this.audioOn[channelIndex]) {
            this.sendOutMessage('AudioOn', inputNumber, 1)
            this.audioOn[channelIndex] = true
        }

        if (outputLevel < 1 && this.audioOn[channelIndex]) {
            this.sendOutMessage('AudioOff', inputNumber, 1)
            // audio off command is a bit slow...
            setTimeout(() => {
                this.sendOutMessage('SetVolume', inputNumber, 75)
            }, 80)
            // this.sendOutMessage('SetVolume', channelTypeIndex + 1, 75, '')
            this.audioOn[channelIndex] = false
        }
    }

    private getInputLocation(channelIndex: number): VMixInputLocation {
        const { privateData, channelType } =
            state.channels[0].chMixerConnection[this.mixerIndex].channel[
                channelIndex
            ]
        const inputNumber = Number(
            privateData?.[PrivateDataTag.INPUT_NUMBER] ?? '0',
        )
        const result: VMixInputLocation = {
            inputNumber,
            channelType,
        }
        if (privateData?.[PrivateDataTag.LINKABLE] === LinkableMode.PRIMARY) {
            result.subchannelNumber = 1
        } else if (
            privateData?.[PrivateDataTag.LINKABLE] === LinkableMode.SECONDARY
        ) {
            result.subchannelNumber = 2
        }
        return result
    }

    private appendSubchannelSuffix(
        command: string,
        subchannelNumber: number | undefined,
    ): string {
        const suffix =
            subchannelNumber !== undefined ? `Channel${subchannelNumber}` : ''
        return command + suffix
    }

    updateChannelName(channelIndex: number) {
        return true
    }

    loadMixerPreset(presetName: string) {
        let data: Preset = JSON.parse(
            fs.readFileSync(path.resolve(STORAGE_FOLDER, presetName), 'utf8'),
        )
        for (const inputsPreset of data) {
            for (const inputNumber of inputsPreset.inputNumbers) {
                const channelIndex = this.lastState.findIndex(
                    (input) => input.number === inputNumber,
                )
                const assignedFaderIndex =
                    this.getAssignedFaderIndex(channelIndex)
                if (inputsPreset.resetChannelMatrix) {
                    const inputSelected = (2 << 16) | (1 << 8)
                    this.hack_rearrangeAudioChannels(inputSelected, inputNumber)
                    store.dispatch({
                        type: FaderActionTypes.SET_INPUT_SELECTOR,
                        faderIndex: assignedFaderIndex,
                        selected: inputSelected,
                    })
                }
                if (inputsPreset.resetGain) {
                    store.dispatch({
                        type: FaderActionTypes.SET_INPUT_GAIN,
                        faderIndex: assignedFaderIndex,
                        level: 0,
                    })
                }
                if (inputsPreset.linkSeparateMono) {
                    global.mainThreadHandler.setLink(assignedFaderIndex, true)
                }
                for (const command of inputsPreset.commands) {
                    this.sendOutMessage(
                        command.name,
                        inputNumber,
                        command.value ?? '',
                    )
                }
            }
        }
        global.mainThreadHandler.updateFullClientStore()
    }

    injectCommand(command: string[]) {}

    doesChannelExists(channelNumber: number): boolean {
        return !!state.channels[0].chMixerConnection[this.mixerIndex].channel[
            channelNumber
        ]
    }

    updateAMixState(channelIndex: number, amixOn: boolean) {}

    updateChannelSetting(
        channelIndex: number,
        setting: string,
        value: string,
    ) {}
}
