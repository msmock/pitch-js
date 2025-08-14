
import fs from 'fs';
import { AudioContext } from 'web-audio-api';

/**
 * test sample rate conversion with an input audio buffer with random audio
 */
async function runTest() {

  const audioCtx = new AudioContext();

  // create a test audio buffer
  // createBuffer(numOfChannels, length, sampleRate)
  let audioBuffer = audioCtx.createBuffer(
    1,
    44100 * 2, // size (sampleRate * duration in sec)
    44100,
  );

  // fill the audio buffer channel with white noise
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let i = 0; i < audioBuffer.length; i++) {
      channelData[i] = 0.0; //Math.random() * 2 - 1;
    }
  }

  console.log("My array buffer sample rate " + audioBuffer.sampleRate);
  console.log("My array buffer duration " + audioBuffer.duration);
  console.log("My array buffer length " + audioBuffer.length);
  console.log("My array buffer channel count " + audioBuffer.numberOfChannels);

  convert(audioBuffer, 48000);

  // see project node-resample on how to convert

}

// run the test
runTest();
