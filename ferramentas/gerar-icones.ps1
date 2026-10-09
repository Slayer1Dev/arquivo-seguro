# Gera os ícones PNG da extensão (escudo vermelho com exclamação).
# Uso: powershell -File ferramentas\gerar-icones.ps1
Add-Type -AssemblyName System.Drawing
$destino = Join-Path $PSScriptRoot '..\extensao\icones'
New-Item -ItemType Directory -Force $destino | Out-Null

foreach ($t in 16, 32, 48, 128) {
  $bmp = New-Object System.Drawing.Bitmap $t, $t
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $e = $t / 128.0

  $escudo = New-Object System.Drawing.Drawing2D.GraphicsPath
  $escudo.AddLine(64 * $e, 6 * $e, 114 * $e, 24 * $e)
  $escudo.AddLine(114 * $e, 24 * $e, 114 * $e, 62 * $e)
  $escudo.AddBezier(114 * $e, 62 * $e, 114 * $e, 92 * $e, 92 * $e, 112 * $e, 64 * $e, 122 * $e)
  $escudo.AddBezier(64 * $e, 122 * $e, 36 * $e, 112 * $e, 14 * $e, 92 * $e, 14 * $e, 62 * $e)
  $escudo.AddLine(14 * $e, 62 * $e, 14 * $e, 24 * $e)
  $escudo.CloseFigure()
  $vermelho = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(197, 34, 31))
  $g.FillPath($vermelho, $escudo)

  $branco = [System.Drawing.Brushes]::White
  $haste = New-Object System.Drawing.Drawing2D.GraphicsPath
  $haste.AddPolygon([System.Drawing.PointF[]]@(
      (New-Object System.Drawing.PointF (54 * $e), (30 * $e)),
      (New-Object System.Drawing.PointF (74 * $e), (30 * $e)),
      (New-Object System.Drawing.PointF (70 * $e), (76 * $e)),
      (New-Object System.Drawing.PointF (58 * $e), (76 * $e))))
  $g.FillPath($branco, $haste)
  $g.FillEllipse($branco, 54 * $e, 84 * $e, 20 * $e, 20 * $e)

  $bmp.Save((Join-Path $destino "icone$t.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
Write-Output "Icones gerados em $destino"
