using System;
using System.Diagnostics;
using System.IO;

internal static class JuaiLauncher
{
    [STAThread]
    private static void Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string node = Path.Combine(root, "runtime", "node.exe");
        string launcher = Path.Combine(root, "app", "launcher.mjs");
        if (!File.Exists(node) || !File.Exists(launcher))
        {
            System.Windows.Forms.MessageBox.Show(
                "JUAI 运行文件不完整，请重新解压完整软件包。",
                "JUAI",
                System.Windows.Forms.MessageBoxButtons.OK,
                System.Windows.Forms.MessageBoxIcon.Error
            );
            return;
        }
        var start = new ProcessStartInfo
        {
            FileName = node,
            Arguments = "\"" + launcher + "\"",
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden
        };
        try
        {
            Process.Start(start);
        }
        catch (Exception error)
        {
            System.Windows.Forms.MessageBox.Show(
                "JUAI 启动失败：" + error.Message,
                "JUAI",
                System.Windows.Forms.MessageBoxButtons.OK,
                System.Windows.Forms.MessageBoxIcon.Error
            );
        }
    }
}
