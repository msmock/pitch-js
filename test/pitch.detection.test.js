import * as tf from '@tensorflow/tfjs';
import fs from 'fs';
import {Resampler} from '../lib/resampler.js';
import {ConvertToWav} from '../lib/convert2wav.js';
import {AudioContext} from 'web-audio-api';
import {BasicPitch} from '../src/basic.pitch.js';
import {MidiExporter} from '../src/midi.exporter.js';
import * as tfnode from '@tensorflow/tfjs-node';
import load from "audio-loader";

/**
 * convert the midi pitch to human readable pitch
 *
 * HR test: expect to run without exception
 *
 * @param {*} note
 * @returns
 */
function midiToPitch(note) {
  const midiNote = note.pitchMidi;
  const noteMapping = [
    'C', 'C#', 'D', 'D#', 'E', 'F',
    'F#', 'G', 'G#', 'A', 'A#', 'B'
  ];
  const octave = Math.floor(midiNote / 12) - 1;
  const noteIndex = midiNote % 12;
  return noteMapping[noteIndex] + octave.toString();
};

// used to sort notes
function compare(note1, note2) {
  if (note1.startTimeSeconds < note2.startTimeSeconds) return -1;
  if (note1.startTimeSeconds > note2.startTimeSeconds) return 1;
  return 0;
}

/**
 * Write the pitch detection results to file as json and midi
 *
 * @param {*} namePrefix the filename prefix
 * @param {*} notes
 * @param {*} noMelodiaNotes
 */
function writeOutputData(namePrefix, notes, noMelodiaNotes) {

  // add the note pitch value, sort and export
  notes.forEach((element) => {
    element.pitch = midiToPitch(element);
    element.pitchBends = [];
  });
  notes.sort(compare);

  fs.writeFileSync(`${namePrefix}.json`, JSON.stringify(notes));
  fs.writeFileSync(`${namePrefix}.nomelodia.json`, JSON.stringify(noMelodiaNotes));
}

/**
 * resample the audio to rate, required by pitch detection (22050)
 *
 * @param {*} audioBuffer
 * @returns resampled AudioBuffer
 */
function resample(audioBuffer) {

  let audioCtx = new AudioContext();

  const rate = 22050;
  const converter = new Resampler();
  const resampled = converter.resample(audioBuffer.getChannelData(0), audioBuffer.sampleRate, rate);

  let outputBuffer = audioCtx.createBuffer(
    audioBuffer.numberOfChannels,
    resampled.length, // size (sampleRate * duration in sec)
    rate
  );

  // fill the audio buffer channel with white noise
  for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
    const channelData = outputBuffer.getChannelData(channel);
    for (let i = 0; i < outputBuffer.length; i++) {
      channelData[i] = resampled[i];
    }
  }

  console.log('resampled audio to sample rate ' + outputBuffer.sampleRate + ', buffer length ' + outputBuffer.length +
    ', duration ' + outputBuffer.duration + ' and ' + outputBuffer.numberOfChannels + ' channel.');

  audioBuffer = outputBuffer;
  return audioBuffer;
}

/**
 * TODO: the C_maj.resampled.mp3 provides the tempo, while we loose the tempo, when C_maj.mp3 is resampled here
 */
async function runTest() {

  // the audio file to pitch
  const fileToPitch = process.cwd() + '/test/test-input/guitar-c-arp.mp3';
  let audioBuffer = await load(fileToPitch);

  console.log('Run Basic Pitch with audio ' + fileToPitch);
  console.log('AudioBuffer has sampleRate ' + audioBuffer.sampleRate + ', ' +
    audioBuffer.numberOfChannels + ' channel ' + ', buffer length ' + audioBuffer.length +
    ', duration ' + audioBuffer.duration);

  // resample the audio file to rate 22050
  audioBuffer = resample(audioBuffer);

  // write the resampled file to disk
  const controlFile = process.cwd() + '/test/test-output/pitch.detection.test.resampled.wav';
  const convertToWav = new ConvertToWav();
  const exportBuffer = convertToWav.convert(audioBuffer);
  fs.writeFileSync(controlFile, new DataView(exportBuffer));

  // run the basic pitch detection
  const frames = []; // frames where a note is active
  const onsets = []; // the first few frames of every note
  const contours = []; // the estimated phrases (of a voice)

  let pct = 0;

  // load the model
  const modelFile = process.cwd() + '/model/model.json';
  const model = tf.loadGraphModel('file://' + modelFile);
  const basicPitch = new BasicPitch(model);

  await basicPitch.evaluateModel(
    audioBuffer,
    (f, o, c) => {
      frames.push(...f);
      onsets.push(...o);
      contours.push(...c);
    },
    (p) => {
      pct = p;
    }
  );

  // TODO: tune the settings for jazz guitar
  let config = {
    onsetThresh: 0.6, // was 0.5
    frameThresh: 0.4,
    minNoteLength: 80,
    inferOnsets: true,
    maxFreq: 670,
    minFreq: 120,
    melodiaTrick: true,
    energyTolerance: 20, // was 11
  }

  const midiExport = new MidiExporter(180);

  // convert the onsets and frames as returend by BasicPitch to note events
  const melodiaNoteEvents = midiExport.outputToNotesPoly(frames, onsets, config);

  // the extracted melodia notes
  const melodiaNotesAndBends = midiExport.addPitchBendsToNoteEvents(contours, melodiaNoteEvents);

  // convert to note events with pitch, time and bends
  const poly = midiExport.noteFramesToTime(melodiaNotesAndBends);

  // ------- nomelodia ---------

  // nomelodia
  config = {
    onsetThresh: 0.25,
    frameThresh: 0.25,
    minNoteLength: 5,
    inferOnsets: true,
    maxFreq: 1000,
    minFreq: 80,
    melodiaTrick: false,
    energyTolerance: 11,
  }

  // the extracted nomelodia notes
  const noMelodiaNotesAndBends = midiExport.addPitchBendsToNoteEvents(contours, midiExport.outputToNotesPoly(frames, onsets, config));

  // convert to note events with pitch, time and bends
  const polyNoMelodia = midiExport.noteFramesToTime(
    noMelodiaNotesAndBends
  );

  // write json output
  const namePrefix = process.cwd() + '/test/test-output/pitch.detection.test';
  writeOutputData(namePrefix, poly, polyNoMelodia);

  // export midi melodia and nomelodia
  fs.writeFileSync(`${namePrefix}.melodia.mid`, midiExport.generateMidi(poly));
  fs.writeFileSync(`${namePrefix}.nomelodia.mid`, midiExport.generateMidi(polyNoMelodia));

  console.log('Finished pitch detection of file ' + fileToPitch);
}

// run the test
runTest();

