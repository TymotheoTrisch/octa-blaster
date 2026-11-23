using System;
using System.IO;
using System.Drawing;
using System.Diagnostics;
using System.Threading.Tasks;
using System.Windows.Forms;

public static class OctaBlasterSetup {
  [STAThread]
  public static int Main(string[] args) {
    string script = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "windows", "Install.ps1");
    if (!File.Exists(script)) { MessageBox.Show("Extraia o pacote completo antes de instalar.", "OctaBlaster", MessageBoxButtons.OK, MessageBoxIcon.Warning); return 1; }
    Application.EnableVisualStyles();
    var form = new Form { Text = "OctaBlaster — Integração com Firefox", ClientSize = new Size(450, 130), FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false, MinimizeBox = false, StartPosition = FormStartPosition.CenterScreen, BackColor = Color.White };
    var label = new Label { Text = "Preparando o auxiliar local…", AutoSize = false, Location = new Point(24, 22), Size = new Size(400, 40), Font = new Font("Segoe UI", 11), ForeColor = Color.FromArgb(60, 63, 67) };
    var progress = new ProgressBar { Location = new Point(24, 78), Size = new Size(400, 12), Style = ProgressBarStyle.Marquee };
    form.Controls.Add(label); form.Controls.Add(progress);
    int result = 1;
    form.Shown += async (sender, e) => {
      try {
        var start = new ProcessStartInfo("powershell.exe", "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File \"" + script + "\"");
        start.UseShellExecute = false; start.CreateNoWindow = true; start.RedirectStandardOutput = true; start.RedirectStandardError = true;
        using (var process = Process.Start(start)) {
          var output = process.StandardOutput.ReadToEndAsync(); var error = process.StandardError.ReadToEndAsync();
          await Task.Run(() => process.WaitForExit()); await Task.WhenAll(output, error); result = process.ExitCode;
        }
      } catch { result = 1; }
      progress.Style = ProgressBarStyle.Continuous; progress.Value = 100;
      MessageBox.Show(form, result == 0 ? "Integração instalada. O Firefox inicia o auxiliar automaticamente.\n\nNa extensão, abra Inteligência artificial para conferir a conexão." : "Não foi possível concluir a instalação.\n\nConfira se Node.js 22.22.2+ e pnpm 10+ estão instalados. O guia IA-LOCAL.md contém o diagnóstico.", "OctaBlaster", MessageBoxButtons.OK, result == 0 ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
      form.Close();
    };
    Application.Run(form); return result;
  }
}
