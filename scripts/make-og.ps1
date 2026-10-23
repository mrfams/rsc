# Draws the 1200x630 Open Graph card (public/og-image.png).
#
# Windows-only: uses .NET System.Drawing / GDI+ and the Segoe UI font.
# The PNG is the master; convert it to the published JPEG with the Pillow
# snippet in POSTER-MAKE.md (1200x630, RGB, < 300 KB).
#
# Usage (from the repo root):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\make-og.ps1

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'public\og-image.png'
$logoPath = Join-Path $root 'assets\icon.png'

$width = 1200
$height = 630
$bmp = New-Object System.Drawing.Bitmap($width, $height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

function Color([string]$hex, [int]$alpha = 255) {
  $c = [System.Drawing.ColorTranslator]::FromHtml($hex)
  return [System.Drawing.Color]::FromArgb($alpha, $c.R, $c.G, $c.B)
}

function RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

# Base gradient.
$base = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Rectangle(0, 0, $width, $height)),
  (Color '#082F24'),
  (Color '#0E7C5A'),
  18
)
$g.FillRectangle($base, 0, 0, $width, $height)
$base.Dispose()

# Soft decorative shapes.
$glow = New-Object System.Drawing.SolidBrush((Color '#5EE0AE' 18))
$g.FillEllipse($glow, 720, -210, 650, 650)
$g.FillEllipse($glow, 900, 430, 420, 420)
$glow.Dispose()

$linePen = New-Object System.Drawing.Pen((Color '#FFFFFF' 14), 1)
$g.DrawEllipse($linePen, 815, -110, 500, 500)
$g.DrawEllipse($linePen, 960, 500, 280, 280)
$linePen.Dispose()

# Small top label.
$fontLabel = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
$brushMint = New-Object System.Drawing.SolidBrush((Color '#BCEBD9'))
$g.DrawString('EASTERN MEDITERRANEAN UNIVERSITY', $fontLabel, $brushMint, 84, 76)
$fontLabel.Dispose()

# Title, shrunk until it stays clear of the logo card.
$titleSize = 78
$fontTitle = $null
while ($titleSize -ge 40) {
  $candidate = New-Object System.Drawing.Font('Segoe UI', $titleSize, [System.Drawing.FontStyle]::Bold)
  if ($g.MeasureString('EMU Bin Tracker', $candidate).Width -le 720) {
    $fontTitle = $candidate
    break
  }
  $candidate.Dispose()
  $titleSize -= 2
}
if (-not $fontTitle) {
  $fontTitle = New-Object System.Drawing.Font('Segoe UI', 40, [System.Drawing.FontStyle]::Bold)
}
$brushWhite = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$g.DrawString('EMU Bin Tracker', $fontTitle, $brushWhite, 78, 120)
$fontTitle.Dispose()

# Accent bar.
$brushAccent = New-Object System.Drawing.SolidBrush((Color '#F5B82E'))
$g.FillRectangle($brushAccent, 84, 236, 92, 7)
$brushAccent.Dispose()

# Subtitle.
$fontSub = New-Object System.Drawing.Font('Segoe UI', 31, [System.Drawing.FontStyle]::Regular)
$brushSoft = New-Object System.Drawing.SolidBrush((Color '#E7F7F0'))
$g.DrawString('A community map of recycling bins', $fontSub, $brushSoft, 84, 278)
$g.DrawString('across the EMU campus.', $fontSub, $brushSoft, 84, 326)
$fontSub.Dispose()

# Feature chips.
$fontChip = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
$chipBrush = New-Object System.Drawing.SolidBrush((Color '#FFFFFF' 24))
$chipText = New-Object System.Drawing.SolidBrush((Color '#FFFFFF'))
$chips = @('Find bins', 'Add sightings', 'Track impact')
$chipX = 84
foreach ($chip in $chips) {
  $textSize = $g.MeasureString($chip, $fontChip)
  $cw = [Math]::Ceiling($textSize.Width) + 34
  $path = RoundRect $chipX 414 $cw 44 22
  $g.FillPath($chipBrush, $path)
  $g.DrawString($chip, $fontChip, $chipText, $chipX + 17, 424)
  $path.Dispose()
  $chipX += $cw + 12
}
$fontChip.Dispose()
$chipBrush.Dispose()
$chipText.Dispose()

# Footer.
$fontFooter = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Regular)
$brushFooter = New-Object System.Drawing.SolidBrush((Color '#BCEBD9'))
$g.DrawString('Recycling & Sustainability Club   |   emu-bin-tracker.vercel.app', $fontFooter, $brushFooter, 84, 548)
$fontFooter.Dispose()
$brushFooter.Dispose()

# Logo card with shadow.
$cardX = 842
$cardY = 152
$cardSize = 300
$shadowPath = RoundRect ($cardX + 10) ($cardY + 14) $cardSize $cardSize 58
$shadowBrush = New-Object System.Drawing.SolidBrush((Color '#001A12' 80))
$g.FillPath($shadowBrush, $shadowPath)
$shadowPath.Dispose()
$shadowBrush.Dispose()

$cardPath = RoundRect $cardX $cardY $cardSize $cardSize 58
$cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$g.FillPath($cardBrush, $cardPath)
$cardPath.Dispose()
$cardBrush.Dispose()

$logo = [System.Drawing.Image]::FromFile($logoPath)
$logoSize = 236
$logoX = $cardX + [int](($cardSize - $logoSize) / 2)
$logoY = $cardY + [int](($cardSize - $logoSize) / 2)
$g.DrawImage($logo, $logoX, $logoY, $logoSize, $logoSize)
$logo.Dispose()

# Small label under logo card.
$fontTag = New-Object System.Drawing.Font('Segoe UI', 16, [System.Drawing.FontStyle]::Bold)
$brushTag = New-Object System.Drawing.SolidBrush((Color '#FFFFFF' 205))
$tag = 'COMMUNITY-POWERED CAMPUS MAP'
$tagSize = $g.MeasureString($tag, $fontTag)
$g.DrawString($tag, $fontTag, $brushTag, $cardX + (($cardSize - $tagSize.Width) / 2), 486)
$fontTag.Dispose()
$brushTag.Dispose()

$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Output "Wrote $out"
