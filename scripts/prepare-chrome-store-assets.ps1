$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$storeAssets = Join-Path $root "docs/chrome-store/assets"
$extensionIconDir = Join-Path $root "apps/extension/public/icon"
New-Item -ItemType Directory -Force -Path $storeAssets, $extensionIconDir | Out-Null

function New-Graphics($bitmap) {
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  return $graphics
}

function New-RoundRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function Fill-RoundRect($graphics, $brush, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-RoundRectPath $x $y $w $h $r
  $graphics.FillPath($brush, $path)
  $path.Dispose()
}

function Draw-RoundRect($graphics, $pen, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-RoundRectPath $x $y $w $h $r
  $graphics.DrawPath($pen, $path)
  $path.Dispose()
}

function Save-Png($bitmap, [string]$path) {
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Draw-CenteredText($graphics, [string]$text, $font, $brush, [float]$x, [float]$y, [float]$w, [float]$h) {
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $graphics.DrawString($text, $font, $brush, (New-Object System.Drawing.RectangleF($x, $y, $w, $h)), $format)
  $format.Dispose()
}

$blue = [System.Drawing.Color]::FromArgb(22, 85, 220)
$teal = [System.Drawing.Color]::FromArgb(15, 171, 150)
$ink = [System.Drawing.Color]::FromArgb(24, 32, 48)
$muted = [System.Drawing.Color]::FromArgb(83, 96, 116)
$danger = [System.Drawing.Color]::FromArgb(214, 54, 54)
$amber = [System.Drawing.Color]::FromArgb(237, 151, 48)
$green = [System.Drawing.Color]::FromArgb(22, 143, 91)
$panel = [System.Drawing.Color]::White
$line = [System.Drawing.Color]::FromArgb(218, 225, 235)

# Extension icons. Every size is drawn from the same artwork in 128-unit space and
# scaled by the transform, so small sizes stay crisp instead of being a blurred
# downscale of the large one. The "AI" badge is drawn at 128 only: below that its
# lettering renders as an unreadable smudge that muddies the silhouette, so the
# small sizes carry the shield and check alone.
function New-AgentSafeIcon([int]$size) {
  $bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = New-Graphics $bitmap
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.ScaleTransform(($size / 128.0), ($size / 128.0))

  $shieldPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $shieldPath.AddLines(@(
    (New-Object System.Drawing.PointF(64, 16)),
    (New-Object System.Drawing.PointF(104, 31)),
    (New-Object System.Drawing.PointF(98, 82)),
    (New-Object System.Drawing.PointF(64, 112)),
    (New-Object System.Drawing.PointF(30, 82)),
    (New-Object System.Drawing.PointF(24, 31))
  ))
  $shieldPath.CloseFigure()
  $iconGradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(22, 16)),
    (New-Object System.Drawing.Point(106, 112)),
    $blue,
    $teal
  )
  $graphics.FillPath($iconGradient, $shieldPath)
  $graphics.DrawPath((New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(245, 255, 255, 255), 3)), $shieldPath)
  $graphics.DrawLine((New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(245, 255, 255, 255), 10)), 44, 64, 58, 78)
  $graphics.DrawLine((New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(245, 255, 255, 255), 10)), 58, 78, 86, 46)

  if ($size -ge 128) {
    $graphics.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(250, 255, 255, 255))), 78, 72, 21, 21)
    $graphics.DrawString("AI", (New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)), (New-Object System.Drawing.SolidBrush($blue)), 81, 72)
  }

  $iconGradient.Dispose()
  $shieldPath.Dispose()
  $graphics.Dispose()
  return $bitmap
}

$iconStorePath = Join-Path $storeAssets "agentsafe-icon-128.png"
$iconPackagePath = Join-Path $extensionIconDir "128.png"
$iconPaths = @()
foreach ($size in 16, 32, 48, 128) {
  $sized = New-AgentSafeIcon $size
  $target = Join-Path $extensionIconDir "$size.png"
  Save-Png $sized $target
  $iconPaths += $target
  if ($size -eq 128) { Save-Png $sized $iconStorePath }
  $sized.Dispose()
}

# The 1280x800 store screenshot is no longer drawn here. It is captured from the
# running extension by e2e/store-screenshot.spec.ts (pnpm capture:screenshot), so
# the listing shows the real side panel rather than an illustration of it.
$brushWhite = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

# 440x280 small promotional tile for the Store Listing graphic assets section.
$promo = New-Object System.Drawing.Bitmap 440, 280, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = New-Graphics $promo
$promoBg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point(0, 0)),
  (New-Object System.Drawing.Point(440, 280)),
  [System.Drawing.Color]::FromArgb(18, 79, 207),
  [System.Drawing.Color]::FromArgb(12, 161, 145)
)
$g.FillRectangle($promoBg, 0, 0, 440, 280)
$promoBg.Dispose()
Fill-RoundRect $g (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235, 255, 255, 255))) 32 34 116 116 18
$g.DrawImage([System.Drawing.Image]::FromFile($iconStorePath), 50, 50, 80, 80)
$g.DrawString("AgentSafe", (New-Object System.Drawing.Font("Segoe UI", 34, [System.Drawing.FontStyle]::Bold)), $brushWhite, 174, 48)
$g.DrawString("Prompt Injection Detector", (New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Regular)), $brushWhite, 178, 98)
Fill-RoundRect $g (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(44, 255, 255, 255))) 174 146 222 46 8
Draw-CenteredText $g "Local scanning. Safer AI input." (New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)) $brushWhite 174 146 222 46
$g.DrawString("No backend. No telemetry.", (New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Regular)), $brushWhite, 178, 210)
$smallPromoPath = Join-Path $storeAssets "agentsafe-small-promo-440x280.png"
Save-Png $promo $smallPromoPath
$promo.Dispose()
$g.Dispose()

Write-Host "Created:"
foreach ($path in $iconPaths) { Write-Host " - $path" }
Write-Host " - $iconStorePath"
Write-Host " - $smallPromoPath"
Write-Host "Store screenshot is captured separately: pnpm capture:screenshot"
