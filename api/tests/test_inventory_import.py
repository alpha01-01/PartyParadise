import io
import zipfile

from app.routers.inventory import _parse_csv_rows, _parse_xlsx_rows


def make_simple_xlsx(headers, rows):
    def col_name(index: int) -> str:
        name = ""
        current = index + 1
        while current:
            current, rem = divmod(current - 1, 26)
            name = chr(65 + rem) + name
        return name

    shared_values = []
    shared_index = {}

    def shared_id(value: str) -> int:
        if value not in shared_index:
            shared_index[value] = len(shared_values)
            shared_values.append(value)
        return shared_index[value]

    all_rows = [headers, *rows]
    row_xml = []
    for row_number, row in enumerate(all_rows, start=1):
        cells = []
        for column_index, value in enumerate(row):
            cell_ref = f"{col_name(column_index)}{row_number}"
            idx = shared_id(str(value))
            cells.append(f'<c r="{cell_ref}" t="s"><v>{idx}</v></c>')
        row_xml.append(f'<row r="{row_number}">{"".join(cells)}</row>')

    shared_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        f'count="{len(shared_values)}" uniqueCount="{len(shared_values)}">'
        + "".join(f"<si><t>{value}</t></si>" for value in shared_values)
        + "</sst>"
    )
    sheet_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(row_xml)}</sheetData>'
        "</worksheet>"
    )
    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>'
        "</workbook>"
    )
    workbook_rels = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        "</Relationships>"
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
        "</Types>"
    )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", root_rels)
        archive.writestr("xl/workbook.xml", workbook_xml)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        archive.writestr("xl/worksheets/sheet1.xml", sheet_xml)
        archive.writestr("xl/sharedStrings.xml", shared_xml)
    return buffer.getvalue()


def test_parse_csv_rows_normalises_headers():
    rows = _parse_csv_rows(
        b"Name,Category,Unit,Opening Stock\nConfetti,Decor,pack,24\n"
    )

    assert rows == [
        {
            "name": "Confetti",
            "category": "Decor",
            "unit": "pack",
            "opening_stock": "24",
        }
    ]


def test_parse_xlsx_rows_reads_first_sheet():
    payload = make_simple_xlsx(
        ["Name", "Category", "Unit", "Initial Quantity"],
        [["Balloons", "Decor", "pack", "48"]],
    )

    rows = _parse_xlsx_rows(payload)

    assert rows == [
        {
            "name": "Balloons",
            "category": "Decor",
            "unit": "pack",
            "initial_quantity": "48",
        }
    ]
