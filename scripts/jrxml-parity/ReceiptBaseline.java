import com.fasterxml.jackson.databind.ObjectMapper;
import net.sf.jasperreports.engine.*;
import net.sf.jasperreports.engine.data.JRMapCollectionDataSource;
import java.nio.file.*;
import java.sql.Date;
import java.util.*;

/** Renders a receipt JRXML against synthetic input without running its SQL. */
public class ReceiptBaseline {
  @SuppressWarnings("unchecked")
  public static void main(String[] args) throws Exception {
    if (args.length != 3) throw new IllegalArgumentException("Usage: ReceiptBaseline report.jrxml rows.json output.pdf");
    Map<String, Object> input = new ObjectMapper().readValue(Files.readString(Path.of(args[1])), Map.class);
    List<Map<String, ?>> rows = new ArrayList<>();
    for (Map<String, Object> raw : (List<Map<String, Object>>) input.get("rows")) {
      Map<String, Object> row = new HashMap<>(raw);
      if (row.get("rh_date") instanceof String date) row.put("rh_date", Date.valueOf(date));
      rows.add(row);
    }
    JasperReport report = JasperCompileManager.compileReport(args[0]);
    Map<String, Object> parameters = (Map<String, Object>) input.getOrDefault("parameters", Map.of());
    JasperPrint print = JasperFillManager.fillReport(report, parameters, new JRMapCollectionDataSource(rows));
    JasperExportManager.exportReportToPdfFile(print, args[2]);
    System.out.println("pages=" + print.getPages().size());
  }
}
