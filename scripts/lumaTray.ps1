<#
.SYNOPSIS
    LUMA System Tray Controller
    Provides Windows background control, mute toggle, and quick launcher.
#>

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$appPort = 3001
$uiUrl = "http://localhost:5173"

$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
$notifyIcon.Text = "LUMA Assistant — Background Runtime"
$notifyIcon.Visible = $true

$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip

# 1. Open Interface
$itemOpen = New-Object System.Windows.Forms.ToolStripMenuItem
$itemOpen.Text = "Open LUMA Interface"
$itemOpen.Add_Click({
    Start-Process $uiUrl
})
$contextMenu.Items.Add($itemOpen) | Out-Null

$contextMenu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

# 2. Toggle Mic Mute
$itemMute = New-Object System.Windows.Forms.ToolStripMenuItem
$itemMute.Text = "Mute Microphone"
$itemMute.Add_Click({
    try {
        $cur = Invoke-RestMethod -Uri "http://localhost:$appPort/api/voice/status" -Method Get
        $newMuted = -not $cur.isMuted
        Invoke-RestMethod -Uri "http://localhost:$appPort/api/voice/mute" -Method Post -ContentType "application/json" -Body (@{ muted = $newMuted } | ConvertTo-Json)
        $itemMute.Text = if ($newMuted) { "Unmute Microphone" } else { "Mute Microphone" }
    } catch {}
})
$contextMenu.Items.Add($itemMute) | Out-Null

# 3. Toggle TTS
$itemTts = New-Object System.Windows.Forms.ToolStripMenuItem
$itemTts.Text = "Mute Voice Responses"
$itemTts.Add_Click({
    try {
        $cur = Invoke-RestMethod -Uri "http://localhost:$appPort/api/voice/status" -Method Get
        $newMuted = -not $cur.isTtsMuted
        Invoke-RestMethod -Uri "http://localhost:$appPort/api/voice/tts-mute" -Method Post -ContentType "application/json" -Body (@{ muted = $newMuted } | ConvertTo-Json)
        $itemTts.Text = if ($newMuted) { "Unmute Voice Responses" } else { "Mute Voice Responses" }
    } catch {}
})
$contextMenu.Items.Add($itemTts) | Out-Null

$contextMenu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

# 4. Restart LUMA
$itemRestart = New-Object System.Windows.Forms.ToolStripMenuItem
$itemRestart.Text = "Restart LUMA"
$itemRestart.Add_Click({
    try {
        Invoke-RestMethod -Uri "http://localhost:$appPort/api/system/restart" -Method Post
    } catch {}
})
$contextMenu.Items.Add($itemRestart) | Out-Null

# 5. Exit LUMA
$itemExit = New-Object System.Windows.Forms.ToolStripMenuItem
$itemExit.Text = "Exit LUMA"
$itemExit.Add_Click({
    try {
        Invoke-RestMethod -Uri "http://localhost:$appPort/api/system/shutdown" -Method Post
    } catch {}
    $notifyIcon.Visible = $false
    [System.Windows.Forms.Application]::Exit()
})
$contextMenu.Items.Add($itemExit) | Out-Null

$notifyIcon.ContextMenuStrip = $contextMenu

# Double click opens UI
$notifyIcon.Add_DoubleClick({
    Start-Process $uiUrl
})

$notifyIcon.ShowBalloonTip(3000, "LUMA Assistant", "Running in background. Say 'Hey Luma' anytime.", [System.Windows.Forms.ToolTipIcon]::Info)

# Run Windows message loop
[System.Windows.Forms.Application]::Run()
