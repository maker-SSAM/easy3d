# 이 폴더를 http://localhost:8099 로 서빙하는 간단한 로컬 서버.
# file:// 로 열면 로컬 폰트 파일 등을 브라우저가 막을 수 있어서, 항상 이 서버로 열어야 합니다.
$port = 8099
$root = $PSScriptRoot

# "localhost" 전용 바인딩은 같은 PC에서만 접속된다. 같은 와이파이의 휴대폰에서도 열어보려면
# "+"(모든 주소)로 바인딩해야 하는데, 이건 Windows 정책상 관리자 권한으로 실행하거나 아래
# urlacl을 미리 등록해둬야 한다(관리자 PowerShell에서 한 번만: 이 줄 그대로 복사해서 실행
#   netsh http add urlacl url=http://+:8099/ user=Everyone
# ). 등록해두면 이후엔 이 스크립트를 관리자 권한 없이 실행해도 "+"바인딩이 된다.
# 실패하면(둘 다 준비 안 된 경우) localhost 전용으로 자동 대체된다 — 이 PC에서 여는 건 계속 된다.
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$port/")
$lanMode = $true
try {
    $listener.Start()
} catch {
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$port/")
    $lanMode = $false
    try {
        $listener.Start()
    } catch {
        Write-Output "서버를 시작하지 못했습니다. 이미 실행 중인지 확인해주세요: http://localhost:$port/"
        Read-Host "엔터를 누르면 창이 닫힙니다"
        exit
    }
}

Write-Output "로컬 서버 시작: http://localhost:$port/"
if ($lanMode) {
    $lanIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1 -ExpandProperty IPAddress)
    if ($lanIp) {
        Write-Output "같은 와이파이의 휴대폰에서: http://${lanIp}:$port/  (처음 실행 시 방화벽 허용 창이 뜨면 '허용' 클릭)"
    }
} else {
    Write-Output "(휴대폰 접속을 켜려면 관리자 PowerShell에서 한 번만: netsh http add urlacl url=http://+:8099/ user=Everyone 실행 후 이 스크립트를 다시 켜보세요)"
}
Write-Output "(이 창을 닫으면 서버가 멈춥니다. 종료하려면 Ctrl+C)"

$mime = @{
    '.html'  = 'text/html; charset=utf-8'
    '.js'    = 'application/javascript; charset=utf-8'
    '.css'   = 'text/css; charset=utf-8'
    '.json'  = 'application/json; charset=utf-8'
    '.ttf'   = 'font/ttf'
    '.otf'   = 'font/otf'
    '.woff'  = 'font/woff'
    '.woff2' = 'font/woff2'
    '.png'   = 'image/png'
    '.jpg'   = 'image/jpeg'
    '.jpeg'  = 'image/jpeg'
    '.svg'   = 'image/svg+xml'
}

# 요청 하나를 처리하는 로직. RunspacePool의 워커들이 각자 이 스크립트를 병렬로 실행한다.
# 단일 스레드로 GetContext() -> 처리 -> GetContext() 를 반복하면, 페이지 전환처럼 폰트/CSS/JS
# 등 여러 리소스가 동시에 몰릴 때 뒤에 밀린 요청이 "서버에 연결할 수 없음" 에러로 끊길 수 있었다.
$handleRequest = {
    param($context, $root, $mime)
    $req = $context.Request
    $res = $context.Response
    try {
        $relPath = [Uri]::UnescapeDataString($req.Url.LocalPath.TrimStart('/'))
        if ($relPath -eq '') { $relPath = 'index.html' }
        $filePath = Join-Path $root $relPath

        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $ext = [System.IO.Path]::GetExtension($filePath)
            $contentType = $mime[$ext]
            if (-not $contentType) { $contentType = 'application/octet-stream' }
            $res.ContentType = $contentType
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $res.StatusCode = 404
        }
    } finally {
        $res.OutputStream.Close()
    }
}

$runspacePool = [runspacefactory]::CreateRunspacePool(1, 8)
$runspacePool.Open()
$pending = New-Object System.Collections.ArrayList

while ($listener.IsListening) {
    $context = $listener.GetContext()

    $ps = [powershell]::Create()
    $ps.RunspacePool = $runspacePool
    [void]$ps.AddScript($handleRequest).AddArgument($context).AddArgument($root).AddArgument($mime)
    $handle = $ps.BeginInvoke()
    [void]$pending.Add(@{ Ps = $ps; Handle = $handle })

    # 매 요청마다 이미 끝난 작업들을 정리해서 핸들이 계속 쌓이지 않게 한다.
    for ($i = $pending.Count - 1; $i -ge 0; $i--) {
        if ($pending[$i].Handle.IsCompleted) {
            try { $pending[$i].Ps.EndInvoke($pending[$i].Handle) } catch {}
            $pending[$i].Ps.Dispose()
            $pending.RemoveAt($i)
        }
    }
}
