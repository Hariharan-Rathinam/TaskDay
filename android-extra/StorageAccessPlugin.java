package com.taskday.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Plain file access to a shared folder (e.g. one synced by Syncthing).
 * Needs "All files access" on Android 11+, or storage permission on Android 10 and older.
 */
@CapacitorPlugin(name = "StorageAccess")
public class StorageAccessPlugin extends Plugin {

    private boolean granted() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return Environment.isExternalStorageManager();
        }
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void check(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", granted());
        call.resolve(r);
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (!granted()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(i);
                } catch (Exception e) {
                    Intent i = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(i);
                }
            } else {
                ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.WRITE_EXTERNAL_STORAGE, Manifest.permission.READ_EXTERNAL_STORAGE }, 4711);
            }
        }
        JSObject r = new JSObject();
        r.put("granted", granted());
        call.resolve(r);
    }

    @PluginMethod
    public void list(PluginCall call) {
        String path = call.getString("path");
        if (path == null) { call.reject("path required"); return; }
        File dir = new File(path);
        JSArray arr = new JSArray();
        File[] files = dir.listFiles();
        if (files != null) {
            for (File f : files) {
                if (!f.isFile()) continue;
                JSObject o = new JSObject();
                o.put("name", f.getName());
                o.put("mtime", f.lastModified());
                o.put("size", f.length());
                arr.put(o);
            }
        }
        JSObject r = new JSObject();
        r.put("files", arr);
        call.resolve(r);
    }

    @PluginMethod
    public void read(PluginCall call) {
        String path = call.getString("path");
        if (path == null) { call.reject("path required"); return; }
        try {
            byte[] b = readAll(new File(path));
            JSObject r = new JSObject();
            r.put("data", new String(b, StandardCharsets.UTF_8));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("read failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        String path = call.getString("path");
        String data = call.getString("data", "");
        if (path == null) { call.reject("path required"); return; }
        try {
            File f = new File(path);
            File parent = f.getParentFile();
            if (parent != null && !parent.exists()) parent.mkdirs();
            // write to a hidden temp file, then rename: other apps (Syncthing) never see a half-written file
            File tmp = new File(parent, "." + f.getName() + ".tmp");
            try (FileOutputStream os = new FileOutputStream(tmp)) {
                os.write(data.getBytes(StandardCharsets.UTF_8));
                os.getFD().sync();
            }
            if (!tmp.renameTo(f)) {
                try (FileOutputStream os = new FileOutputStream(f)) {
                    os.write(data.getBytes(StandardCharsets.UTF_8));
                }
                tmp.delete();
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("write failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void mkdir(PluginCall call) {
        String path = call.getString("path");
        if (path == null) { call.reject("path required"); return; }
        File d = new File(path);
        if (!d.exists() && !d.mkdirs()) { call.reject("could not create folder " + path); return; }
        call.resolve();
    }

    private static byte[] readAll(File f) throws IOException {
        try (FileInputStream in = new FileInputStream(f); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }
}
