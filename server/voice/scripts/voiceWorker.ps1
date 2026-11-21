<#
.SYNOPSIS
    LUMA Windows Native Voice Engine Worker
    Local wake-word detection ("Hey Luma"), speech recognition, and TTS synthesis.
    Zero cloud streaming for wake word — 100% on-device Windows Speech API.
#>

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[System.Threading.Thread]::CurrentThread.CurrentCulture = [System.Globalization.CultureInfo]::InvariantCulture

Add-Type -AssemblyName System.Speech

# Output JSON event to stdout
function Send-Event($eventType, $data = @{}) {
    $evt = @{
        event = $eventType
        timestamp = (Get-Date).ToString("o")
    }
    foreach ($k in $data.Keys) {
        $evt[$k] = $data[$k]
    }
    $json = $evt | ConvertTo-Json -Compress
    [Console]::WriteLine($json)
}

# Initialize Speech Synthesizer (TTS)
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = $synth.GetInstalledVoices()
foreach ($v in $voices) {
    if ($v.VoiceInfo.Name -like "*Zira*" -or $v.VoiceInfo.Name -like "*David*") {
        try {
            $synth.SelectVoice($v.VoiceInfo.Name)
            break
        } catch {}
    }
}

# State variables
$isMuted = $false
$isTtsMuted = $false
$engineState = "LISTENING" # LISTENING, RECORDING, PROCESSING, MUTED
$recognizer = $null
$wakeGrammar = $null
$dictationGrammar = $null

function Initialize-Recognizer {
    try {
        $global:recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine

        # Build Wake Word Grammar
        $choices = New-Object System.Speech.Recognition.Choices
        $choices.Add("Hey Luma")
        $choices.Add("Luma")
        $choices.Add("Hello Luma")
        $choices.Add("Hey Luna")
        $choices.Add("Listen Luma")
        $choices.Add("OK Luma")

        $gb = New-Object System.Speech.Recognition.GrammarBuilder
        $gb.Append($choices)
        $global:wakeGrammar = New-Object System.Speech.Recognition.Grammar($gb)
        $global:wakeGrammar.Name = "WakeWordGrammar"
        $global:recognizer.LoadGrammar($global:wakeGrammar)

        # Load Dictation Grammar for general speech commands
        $global:dictationGrammar = New-Object System.Speech.Recognition.DictationGrammar
        $global:dictationGrammar.Name = "DictationGrammar"
        $global:dictationGrammar.Enabled = $false
        $global:recognizer.LoadGrammar($global:dictationGrammar)

        # Attach Event Handlers
        Register-ObjectEvent -InputObject $global:recognizer -EventName "SpeechRecognized" -Action {
            $res = $EventArgs.Result
            $text = $res.Text
            $conf = [Math]::Round($res.Confidence, 3)
            $grammarName = $res.Grammar.Name

            if ($grammarName -eq "WakeWordGrammar" -or $text -match "(?i)\b(hey\s+)?(luma|luna)\b") {
                Send-Event "WAKE_WORD_DETECTED" @{
                    keyword = $text
                    confidence = $conf
                }
            } else {
                Send-Event "COMMAND_RECORDED" @{
                    text = $text
                    confidence = $conf
                }
            }
        } | Out-Null

        Register-ObjectEvent -InputObject $global:recognizer -EventName "SpeechHypothesized" -Action {
            $res = $EventArgs.Result
            Send-Event "SPEECH_HYPOTHESIS" @{
                text = $res.Text
            }
        } | Out-Null

        Register-ObjectEvent -InputObject $global:recognizer -EventName "SpeechRecognitionRejected" -Action {
            Send-Event "SPEECH_REJECTED" @{}
        } | Out-Null

        # Connect to Default Audio Input
        if (-not $global:isMuted) {
            $global:recognizer.SetInputToDefaultAudioDevice()
            $global:recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
            $global:engineState = "LISTENING"
        }

        Send-Event "READY" @{
            state = $global:engineState
            voice = $synth.Voice.Name
        }
    } catch {
        Send-Event "ERROR" @{
            message = "Failed to initialize speech recognition: $($_.Exception.Message)"
        }
    }
}

# Initialize
Initialize-Recognizer

# Main IPC Loop: Listen for commands on stdin
$reader = [System.Console]::In

while ($line = $reader.ReadLine()) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line.Trim() -eq "EXIT") { break }

    try {
        $cmd = $line | ConvertFrom-Json

        switch ($cmd.command) {
            "SPEAK" {
                $textToSpeak = $cmd.text
                if (-not [string]::IsNullOrWhiteSpace($textToSpeak) -and -not $isTtsMuted) {
                    Send-Event "TTS_START" @{ text = $textToSpeak }
                    try {
                        $synth.SpeakAsync($textToSpeak) | Out-Null
                    } catch {
                        Send-Event "ERROR" @{ message = "TTS Error: $($_.Exception.Message)" }
                    }
                }
            }

            "SPEAK_SYNC" {
                $textToSpeak = $cmd.text
                if (-not [string]::IsNullOrWhiteSpace($textToSpeak) -and -not $isTtsMuted) {
                    Send-Event "TTS_START" @{ text = $textToSpeak }
                    try {
                        $synth.Speak($textToSpeak)
                        Send-Event "TTS_END" @{ text = $textToSpeak }
                    } catch {
                        Send-Event "ERROR" @{ message = "TTS Error: $($_.Exception.Message)" }
                    }
                }
            }

            "SET_MUTE" {
                $global:isMuted = [bool]$cmd.muted
                if ($global:isMuted) {
                    try {
                        if ($global:recognizer) {
                            $global:recognizer.RecognizeAsyncCancel()
                            $global:recognizer.SetInputToNull()
                        }
                    } catch {}
                    $global:engineState = "MUTED"
                    Send-Event "STATUS_CHANGED" @{ state = "MUTED"; isMuted = $true }
                } else {
                    try {
                        if ($global:recognizer) {
                            $global:recognizer.SetInputToDefaultAudioDevice()
                            $global:recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
                        }
                    } catch {}
                    $global:engineState = "LISTENING"
                    Send-Event "STATUS_CHANGED" @{ state = "LISTENING"; isMuted = $false }
                }
            }

            "SET_TTS_MUTE" {
                $global:isTtsMuted = [bool]$cmd.muted
                Send-Event "TTS_MUTE_CHANGED" @{ isTtsMuted = $global:isTtsMuted }
            }

            "ENABLE_DICTATION" {
                if ($global:recognizer -and -not $global:isMuted) {
                    try {
                        $global:wakeGrammar.Enabled = $false
                        $global:dictationGrammar.Enabled = $true
                        $global:engineState = "RECORDING"
                        Send-Event "STATUS_CHANGED" @{ state = "RECORDING" }
                    } catch {}
                }
            }

            "ENABLE_WAKE_WORD" {
                if ($global:recognizer -and -not $global:isMuted) {
                    try {
                        $global:dictationGrammar.Enabled = $false
                        $global:wakeGrammar.Enabled = $true
                        $global:engineState = "LISTENING"
                        Send-Event "STATUS_CHANGED" @{ state = "LISTENING" }
                    } catch {}
                }
            }

            "SIMULATE_WAKE" {
                $keyword = if ($cmd.keyword) { $cmd.keyword } else { "Hey Luma" }
                Send-Event "WAKE_WORD_DETECTED" @{
                    keyword = $keyword
                    confidence = 0.99
                    embeddedCommand = $cmd.embeddedCommand
                }
            }

            "SIMULATE_COMMAND" {
                $text = $cmd.text
                Send-Event "COMMAND_RECORDED" @{
                    text = $text
                    confidence = 0.98
                }
            }

            "STATUS" {
                Send-Event "STATUS_CHANGED" @{
                    state = $global:engineState
                    isMuted = $global:isMuted
                    isTtsMuted = $global:isTtsMuted
                }
            }
        }
    } catch {
        Send-Event "ERROR" @{ message = "Command dispatch error: $($_.Exception.Message)" }
    }
}

# Cleanup on exit
try {
    if ($global:recognizer) {
        $global:recognizer.RecognizeAsyncCancel()
        $global:recognizer.Dispose()
    }
    if ($synth) {
        $synth.Dispose()
    }
} catch {}

Send-Event "SHUTDOWN" @{}
