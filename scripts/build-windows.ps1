#requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$NoPause,
    [switch]$NoOpenFolder
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $projectRoot 'logs'
$logWriter = $null
$buildLock = $null
$exitCode = 1

function Write-BuildMessage {
    param([string]$Message)
    Write-Host $Message
    if ($null -ne $logWriter) {
        $logWriter.WriteLine($Message)
    }
}

function Invoke-BuildCommand {
    param([string]$Executable, [string[]]$Arguments)
    Write-BuildMessage "> $Executable $($Arguments -join ' ')"
    # PowerShell 5 treats native stderr as ErrorRecord; warnings must not stop a build.
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $Executable @Arguments 2>&1 | ForEach-Object {
            if ($_ -is [System.Management.Automation.ErrorRecord]) {
                Write-BuildMessage $_.Exception.Message
            } else {
                Write-BuildMessage $_.ToString()
            }
        }
        $commandExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($commandExitCode -ne 0) {
        throw "命令失败，退出码：$commandExitCode。请查看上方错误和日志。"
    }
}

function Assert-BuildEnvironment {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($null -eq $node -or $null -eq $npm) {
        throw '未找到 Node.js 或 npm。请先安装 Node.js 22 或更高版本，安装后重新双击一键打包.cmd。'
    }
    $nodeVersion = & $node.Source --version
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.') {
        throw '无法读取 Node.js 版本，请检查 Node.js 安装。'
    }
    if ([int]$Matches[1] -lt 22) {
        throw "当前 Node.js 为 $nodeVersion，需要 22 或更高版本。"
    }
    Write-BuildMessage "Node.js：$nodeVersion"
    $outputDirectory = Join-Path $projectRoot 'dist\windows'
    $running = Get-CimInstance Win32_Process -Filter "Name LIKE 'Excalidraw%'" |
        Where-Object {
            $_.ExecutablePath -and $_.ExecutablePath.StartsWith(
                "$outputDirectory\", [System.StringComparison]::OrdinalIgnoreCase
            )
        }
    if ($running) {
        throw '输出目录中的 Excalidraw 正在运行。请先关闭该程序，再重新打包。'
    }
    return @{ Node = $node.Source; Npm = $npm.Source }
}

try {
    $utf8 = [System.Text.UTF8Encoding]::new($false)
    [Console]::OutputEncoding = $utf8
    $OutputEncoding = $utf8
    Set-Location -LiteralPath $projectRoot
    [System.IO.Directory]::CreateDirectory($logDirectory) | Out-Null
    $logPath = Join-Path $logDirectory ("windows-build-{0}-{1}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'), $PID)
    $logWriter = [System.IO.StreamWriter]::new($logPath, $false, [System.Text.UTF8Encoding]::new($false))
    $logWriter.AutoFlush = $true
    Write-BuildMessage 'Excalidraw Windows 离线版：一键编译和打包'
    Write-BuildMessage "项目目录：$projectRoot"
    Write-BuildMessage "完整日志：$logPath"
    try {
        $buildLock = [System.IO.File]::Open(
            (Join-Path $logDirectory 'windows-build.lock'),
            [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite,
            [System.IO.FileShare]::None
        )
    } catch [System.IO.IOException] {
        throw '已有一键打包任务正在运行，请等待它完成后再重试。'
    }
    $commands = Assert-BuildEnvironment
    Write-BuildMessage '[1/3] 检查并安装锁定的项目依赖（首次运行需要联网）...'
    Invoke-BuildCommand $commands.Npm @(
        'exec', '--yes', '--package=yarn@1.22.22', '--',
        'yarn', 'install', '--frozen-lockfile', '--non-interactive', '--no-progress',
        '--network-timeout', '30000', '--registry', 'https://registry.npmjs.org'
    )
    Write-BuildMessage '[2/3] 编译网页资源并生成 Windows 64 位免安装 EXE...'
    Invoke-BuildCommand $commands.Node @('scripts/build-desktop.cjs')
    Write-BuildMessage '[3/3] 检查生成文件...'
    $version = (Get-Content -LiteralPath (Join-Path $projectRoot 'desktop\package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
    $outputDirectory = Join-Path $projectRoot 'dist\windows'
    $executable = Join-Path $outputDirectory "Excalidraw-Offline-$version-win-x64.exe"
    $artifact = Get-Item -LiteralPath $executable -ErrorAction Stop
    if ($artifact.Length -eq 0) {
        throw "生成的 EXE 为空：$executable"
    }
    Write-BuildMessage ''
    Write-BuildMessage "打包成功：$executable"
    Write-BuildMessage ('大小：{0:N1} MiB；可单独复制并双击运行。' -f ($artifact.Length / 1MB))
    $exitCode = 0
    if (-not $NoOpenFolder) {
        try {
            Start-Process explorer.exe -ArgumentList ('"{0}"' -f $outputDirectory) | Out-Null
        } catch {
            Write-BuildMessage "未能自动打开目录，请手动打开：$outputDirectory"
        }
    }
} catch {
    Write-BuildMessage ''
    Write-BuildMessage "打包未完成：$($_.Exception.Message)"
    if ($logPath) {
        Write-BuildMessage "完整日志：$logPath"
    }
} finally {
    if ($null -ne $buildLock) { $buildLock.Dispose() }
    if ($null -ne $logWriter) { $logWriter.Dispose() }
    if (-not $NoPause) {
        Read-Host '按回车键关闭窗口' | Out-Null
    }
}
exit $exitCode
