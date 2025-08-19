# pitch-js

Note: 
- this fork is still under construction and currently not operational.

This fork is a plain javascript version of the original typescript library `basic-pitch-ts` with additional comments, api and tests. It is intended to be used in a jazz guitar training tool I'm currently working on. 

The original Basic Pitch is a typescript library for Automatic Music Transcription (AMT), using lightweight neural network developed by [Spotify's Audio Intelligence Lab](https://research.atspotify.com/audio-intelligence/). Basic pitch is instrument-agnostic and supports polyphonic instruments, so you can freely enjoy transcription of all your favorite music. Basic pitch works best on one instrument at a time.

Like the original code, pitch-js will run a pitch detection of an audio buffer, which can be analyzed and may be exported as MIDI file. 

## Usage
Under developement. 

### Scripts
Under development

### Model Input

**Supported Audio Codecs**

The pitch detection accepts all sound files that are compatible with [AudioBuffer](https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer) including:

- `.mp3`
- `.ogg`
- `.wav`
- `.flac`

**Limitations**
Input audio files must be mono with one single channel of sample rate 22050. 

## Copyright and License
The original typescript library `basic-pitch-ts` is Copyright 2022 Spotify AB.

This software is licensed under the Apache License, Version 2.0 (the "Apache License"). You may choose either license to govern your use of this software only upon the condition that you accept all of the terms of either the Apache License.

You may obtain a copy of the Apache License at:

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the Apache License or the GPL License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the Apache License for the specific language governing permissions and limitations under the Apache License.

