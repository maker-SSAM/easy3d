# 이 폴더를 http://localhost:8099 로 서빙하는 간단한 로컬 서버.
# file:// 로 열면 로컬 폰트 파일 등을 브라우저가 막을 수 있어서, 항상 이 서버로 열어야 합니다.
$port = 8099
$root = $PSScriptRoot

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
try {
    $listener.Start()
} catch {
    Write-Output "서버를 시작하지 못했습니다. 이미 실행 중인지 확인해주세요: http://localhost:$port/"
    Read-Host "엔터를 누르면 창이 닫힙니다"
    exit
}

Write-Output "로컬 서버 시작: http://localhost:$port/"
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

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response
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
    $res.OutputStream.Close()
}
