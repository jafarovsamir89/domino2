package az.simplesoft.dominotelefon;

import android.os.LocaleList;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

@CapacitorPlugin(name = "DominoDeviceRegion")
public class DominoDeviceRegionPlugin extends Plugin {
    @PluginMethod
    public void getRegion(PluginCall call) {
        Locale locale = LocaleList.getDefault().isEmpty()
            ? Locale.getDefault()
            : LocaleList.getDefault().get(0);
        JSObject result = new JSObject();
        result.put("countryCode", locale.getCountry());
        call.resolve(result);
    }
}
