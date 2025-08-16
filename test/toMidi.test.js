import * as tf from '@tensorflow/tfjs-node';

import midipkg from '@tonejs/midi';
const { Midi } = midipkg;

import {
    argRelMax,
    argMax,
    argMaxAxis1,
    whereGreaterThanAxis1,
    meanStdDev,
    getInferredOnsets,
    constrainFrequency,
    modelFrameToTime,
    hzToMidi,
    generateFileData,
    noteFramesToTime,
    midiPitchToContourBin,
    midiToHz,
} from '../src/toMidi.js';

import assert from 'assert';

//------------------ the tests ------------------

let testdata;

assert.deepEqual(hzToMidi(440), 69, 'hzToMidi should understands what 440Hz is');

assert.deepEqual(midiToHz(69), 440, 'midiToHz understands what 69 is');

assert.deepEqual(midiPitchToContourBin(69), 144, 'midiPitchToContourBin should be able to convert 69');

testdata = [[0, 0], [1, 0.0116], [2, 0.0232]];
testdata.forEach((data) => {
    // console.log(data[0] + ' ' + data[1]);
    assert.deepEqual(modelFrameToTime(data[0]).toFixed(4), data[1], 'modelFrameToTime returns correct times');
});


testdata = [[[], null], [[1, 2, -1], 1],];
testdata.forEach((data) => {
    // console.log(data[0] + ' ' + data[1]);
    assert.deepEqual(argMax(data[0]), data[1], 'argMax handles to handle empty and nonempty inputs correctly');
});

testdata = [[10, 11, 12], [13, 14, 15]];
assert.deepEqual(argMaxAxis1(testdata), [2, 2], 'argMaxAxis1 returns the correct indices');

testdata = [[1, 2], [3, 4]];
const [X, Y] = whereGreaterThanAxis1(testdata, 1);
assert.deepEqual(X, [0, 1, 1], 'whereGreaterThanAxis1 should return all elements greater than threshold');
assert.deepEqual(Y, [1, 0, 1], 'whereGreaterThanAxis1 should return all elements greater than threshold');


const expectedMean = 2;
const expectedStd = 2;
const [mean, std] = meanStdDev(tf
    .randomNormal([1000, 1000], expectedMean, expectedStd, 'float32')
    .arraySync());

assert.deepEqual(mean.toFixed(2), 2, 'meanStdDev should return a mean and standard deviation of (2, 2) for an N(2, 4) array');
assert.deepEqual(std.toFixed(2), 2, 'meanStdDev should return a mean and standard deviation of (2, 2) for an N(2, 4) array');


const generatedMidiData = new Midi(
    generateFileData([
        {
            startTimeSeconds: 1,
            durationSeconds: 2,
            pitchMidi: 65,
            amplitude: 0.5,
        },
        {
            startTimeSeconds: 3,
            durationSeconds: 1,
            pitchMidi: 75,
            amplitude: 0.25,
        },
    ])
);

const expectedMidiData = {
    header: {
        keySignatures: [],
        meta: [],
        name: '',
        ppq: 480,
        tempos: [],
        timeSignatures: [],
    },
    tracks: [
        {
            channel: 0,
            controlChanges: {},
            pitchBends: [],
            instrument: {
                family: 'piano',
                number: 0,
                name: 'acoustic grand piano',
            },
            name: '',
            notes: [
                {
                    duration: 2,
                    durationTicks: 1920,
                    midi: 65,
                    name: 'F4',
                    ticks: 960,
                    time: 1,
                    velocity: 0.49606299212598426,
                },
                {
                    duration: 1,
                    durationTicks: 960,
                    midi: 75,
                    name: 'D#5',
                    ticks: 2880,
                    time: 3,
                    velocity: 0.2440944881889764,
                },
            ],
            endOfTrackTicks: 3840,
        },
    ],
};

console.log('header actual/expected'); 
console.log(generatedMidiData.toJSON().header); 
console.log(expectedMidiData.header); 

console.log('tracks actual/expected'); 
console.log(generatedMidiData.toJSON().tracks); 
console.log(expectedMidiData.tracks); 

console.log('track notes actual/expected'); 
console.log(generatedMidiData.toJSON().tracks[0].notes); 
console.log(expectedMidiData.tracks[0].notes); 

assert.deepEqual(generatedMidiData.toJSON(), expectedMidiData, 'generated midi data should match the expected data'); 


/**

test('A MIDI buffer should be created with the correct data', () => {
    
    expect(new Midi(generateFileData([
        {
            startTimeSeconds: 1,
            durationSeconds: 2,
            pitchMidi: 65,
            amplitude: 0.5,
        },
        {
            startTimeSeconds: 3,
            durationSeconds: 1,
            pitchMidi: 75,
            amplitude: 0.25,
        },
    ])).toJSON()).toEqual({
        header: {
            keySignatures: [],
            meta: [],
            name: '',
            ppq: 480,
            tempos: [],
            timeSignatures: [],
        },
        tracks: [
            {
                channel: 0,
                controlChanges: {},
                pitchBends: [],
                instrument: {
                    family: 'piano',
                    number: 0,
                    name: 'acoustic grand piano',
                },
                name: '',
                notes: [
                    {
                        duration: 2,
                        durationTicks: 1920,
                        midi: 65,
                        name: 'F4',
                        ticks: 960,
                        time: 1,
                        velocity: 0.49606299212598426,
                    },
                    {
                        duration: 1,
                        durationTicks: 960,
                        midi: 75,
                        name: 'D#5',
                        ticks: 2880,
                        time: 3,
                        velocity: 0.2440944881889764,
                    },
                ],
                endOfTrackTicks: 3840,
            },
        ],
    });
});

*/
