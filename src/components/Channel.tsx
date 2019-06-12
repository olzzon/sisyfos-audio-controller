import * as React from 'react';
//@ts-ignore
import * as ClassNames from 'classnames';
import { connect } from "react-redux";
import VuMeter from './VuMeter';
import { Store } from 'redux';

//assets:
import '../assets/css/Channel.css';
import { IMixerProtocol, MixerProtocolPresets, IMixerProtocolGeneric, ICasparCGMixerGeometry } from '../constants/MixerProtocolPresets';
import { any } from 'prop-types';

interface IChannelInjectProps {
    pgmOn: boolean,
    pstOn: boolean,
    pflOn: boolean,
    showChannel: boolean,
    faderLevel: number,
    label: string,
    snapOn: boolean[],
    mixerProtocol: string,
    showSnaps: boolean
    showPfl: boolean
}

interface IChannelProps {
    channelIndex: number
}


class Channel extends React.Component<IChannelProps & IChannelInjectProps & Store> {
    mixerProtocol: IMixerProtocolGeneric;
    channelIndex: number;

    constructor(props: any) {
        super(props);
        this.channelIndex = this.props.channelIndex;
        this.mixerProtocol = MixerProtocolPresets[this.props.mixerProtocol] || MixerProtocolPresets.genericMidi;
    }

    public shouldComponentUpdate(nextProps: IChannelInjectProps) {
        return (nextProps.pgmOn != this.props.pgmOn ||
            nextProps.pstOn != this.props.pstOn ||
            nextProps.pflOn != this.props.pflOn ||
            nextProps.showChannel != this.props.showChannel ||
            nextProps.faderLevel != this.props.faderLevel ||
            nextProps.label != this.props.label ||
            nextProps.mixerProtocol != this.props.mixerProtocol ||
            nextProps.showSnaps != this.props.showSnaps ||
            nextProps.showPfl != this.props.showPfl)
//ToDo: handle snaps state re-rendering:  nextProps.snapOn != this.props.snapOn ||
    }

    handlePgm() {
        this.props.dispatch({
            type:'TOGGLE_PGM',
            channel: this.channelIndex
        });
        window.mixerConnection.updateOutLevel(this.channelIndex);
        window.huiRemoteConnection.updateRemotePgmPstPfl(this.channelIndex);
    }

    handlePst() {
        this.props.dispatch({
            type:'TOGGLE_PST',
            channel: this.channelIndex
        });
    }

    handlePfl() {
        this.props.dispatch({
            type:'TOGGLE_PFL',
            channel: this.channelIndex
        });
        window.mixerConnection.updatePflState(this.channelIndex);
        window.huiRemoteConnection.updateRemotePgmPstPfl(this.channelIndex);
    }

    handleLevel(event: any) {
        this.props.dispatch({
            type:'SET_FADER_LEVEL',
            channel: this.channelIndex,
            level: parseFloat(event.target.value)
        });
        window.mixerConnection.updateOutLevel(this.channelIndex);
        window.huiRemoteConnection.updateRemoteFaderState(this.channelIndex, event.target.value)
    }


    handleSnap(snapIndex: number) {
        this.props.dispatch({
            type:'SET_SNAP',
            channel: this.channelIndex,
            snapIndex: snapIndex
        });
    }

    handleShowOptions() {
        this.props.dispatch({
            type: 'TOGGLE_SHOW_OPTION',
            channel: this.channelIndex
        });
    }

    fader() {
        return (
            <input className="channel-volume-slider"
                id="typeinp"
                type="range"
                min={this.mixerProtocol.fader.min}
                max={this.mixerProtocol.fader.max}
                step={this.mixerProtocol.fader.step}
                value= {this.props.faderLevel}
                onChange={event => {
                    event.preventDefault();
                    this.handleLevel(event);
                }}
            />
        )
    }

    pgmButton = () => {
        return (

            <button
                className={ClassNames("channel-pgm-button", {
                    'on': this.props.pgmOn
                })}
                onClick={event => {
                    this.handlePgm();
                }}
            >
                {this.props.label != "" ? this.props.label : ("CH " + (this.channelIndex + 1)) }
            </button>
        )
    }

    pstButton = () => {
        return (
            <button
                className={ClassNames("channel-pst-button", {
                    'on': this.props.pstOn
                })}
                onClick={event => {
                    this.handlePst();
                }}
            >PST</button>
        )
    }


    pflButton = () => {
        return (
            <button
                className={ClassNames("channel-pfl-button", {
                    'on': this.props.pflOn
                })}
                onClick={event => {
                    this.handlePfl();
                }}
            >PFL</button>
        )
    }

    snapButton = (snapIndex: number) => {
        if (this.props.showSnaps) {
            return (
                <div key={snapIndex} className="channel-snap-line">
                    <button
                        className={ClassNames("channel-snap-button", {
                            'on': this.props.snapOn[snapIndex]
                        })}
                        onClick={event => {
                            this.handleSnap(snapIndex);
                        }}
                    >{snapIndex + 1 }</button>
                    <br/>
                </div>
            )
        } else {
            return("")
        }
    }

    channelSettings = () => {
        const mixerProtocol = this.mixerProtocol as ICasparCGMixerGeometry
        if (mixerProtocol.sourceOptions) {
            return <React.Fragment>
                <button className="channel-settings" onClick={e => this.handleShowOptions()}>
                    <svg version="1.1" id="cogwheel" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340.274 340.274">
                        <g>
                            <path d="M293.629,127.806l-5.795-13.739c19.846-44.856,18.53-46.189,14.676-50.08l-25.353-24.77l-2.516-2.12h-2.937
                                c-1.549,0-6.173,0-44.712,17.48l-14.184-5.719c-18.332-45.444-20.212-45.444-25.58-45.444h-35.765
                                c-5.362,0-7.446-0.006-24.448,45.606l-14.123,5.734C86.848,43.757,71.574,38.19,67.452,38.19l-3.381,0.105L36.801,65.032
                                c-4.138,3.891-5.582,5.263,15.402,49.425l-5.774,13.691C0,146.097,0,147.838,0,153.33v35.068c0,5.501,0,7.44,46.585,24.127
                                l5.773,13.667c-19.843,44.832-18.51,46.178-14.655,50.032l25.353,24.8l2.522,2.168h2.951c1.525,0,6.092,0,44.685-17.516
                                l14.159,5.758c18.335,45.438,20.218,45.427,25.598,45.427h35.771c5.47,0,7.41,0,24.463-45.589l14.195-5.74
                                c26.014,11,41.253,16.585,45.349,16.585l3.404-0.096l27.479-26.901c3.909-3.945,5.278-5.309-15.589-49.288l5.734-13.702
                                c46.496-17.967,46.496-19.853,46.496-25.221v-35.029C340.268,146.361,340.268,144.434,293.629,127.806z M170.128,228.474
                                c-32.798,0-59.504-26.187-59.504-58.364c0-32.153,26.707-58.315,59.504-58.315c32.78,0,59.43,26.168,59.43,58.315
                                C229.552,202.287,202.902,228.474,170.128,228.474z"/>
                        </g>
                    </svg>
                </button>
            </React.Fragment>
        }
        return null
    }

    render() {
        return (
        this.props.showChannel === false ?
            <div></div>
            :
            <div className={ClassNames("channel-body", {
                "with-snaps": this.props.showSnaps,
                "with-pfl": this.props.showPfl
            })}>
                {this.channelSettings()}
                {this.fader()}
                <VuMeter channelIndex = {this.channelIndex}/>
                <br/>
                {this.pgmButton()}
                <br/>
                {this.pstButton()}
                <br/>
                {this.props.showPfl ?
                    <React.Fragment>
                        {this.pflButton()}
                        <br />
                    </React.Fragment>
                    : null
                }
                <div className="channel-name">
                    {this.props.label != "" ? this.props.label : ("CH " + (this.channelIndex + 1)) }
                </div>
                <div className="channel-snap-body">
                    {this.props.snapOn
                        .map((none: any, index: number) => {
                            return this.snapButton(index)
                        })
                    }
                </div>
            </div>
        )
    }
}

const mapStateToProps = (state: any, props: any): IChannelInjectProps => {
    return {
        pgmOn: state.channels[0].channel[props.channelIndex].pgmOn,
        pstOn: state.channels[0].channel[props.channelIndex].pstOn,
        pflOn: state.channels[0].channel[props.channelIndex].pflOn,
        showChannel: state.channels[0].channel[props.channelIndex].showChannel,
        faderLevel: state.channels[0].channel[props.channelIndex].faderLevel,
        label: state.channels[0].channel[props.channelIndex].label,
        snapOn: state.channels[0].channel[props.channelIndex].snapOn.map((item: number) => {return item}),
        mixerProtocol: state.settings[0].mixerProtocol,
        showSnaps: state.settings[0].showSnaps,
        showPfl: state.settings[0].showPfl
    }
}

export default connect<any, IChannelInjectProps, any>(mapStateToProps)(Channel) as any;