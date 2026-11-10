"""Focused, execution-free CIL listing for the local investigation (dnfile/dncil)."""
import argparse
from pathlib import Path
import dnfile
from dncil.cil.body import CilMethodBody
from dncil.cil.body.reader import CilMethodBodyReaderBytes

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('assembly')
    ap.add_argument('type')
    ap.add_argument('methods', nargs='*')
    args = ap.parse_args()
    pe = dnfile.dnPE(args.assembly)
    owners = {}
    for t in pe.net.mdtables.TypeDef:
        for m in t.MethodList: owners[id(m.row)] = str(t.TypeName)
        for f in t.FieldList: owners[id(f.row)] = str(t.TypeName)
    for t in pe.net.mdtables.TypeDef:
        if str(t.TypeName) != args.type: continue
        print('TYPE', t.TypeNamespace, t.TypeName)
        print('FIELDS', ', '.join(str(f.row.Name) for f in t.FieldList))
        print('METHODS', ', '.join(str(m.row.Name) for m in t.MethodList))
        for mi in t.MethodList:
            m = mi.row
            if args.methods and str(m.Name) not in args.methods: continue
            print('\nMETHOD', m.Name, 'signature', m.Signature.value.hex())
            if not m.Rva: continue
            body = CilMethodBody(CilMethodBodyReaderBytes(pe.get_data(m.Rva, 200000)))
            for ins in body.instructions:
                op = ins.operand
                if hasattr(op, 'table'):
                    if op.table == 0x70:
                        op = repr(pe.net.user_strings.get(op.rid).value)
                    else:
                        table = pe.net.mdtables.tables.get(op.table)
                        if table and op.rid <= len(table.rows):
                            row = table.rows[op.rid - 1]
                            name = str(getattr(row, 'Name', getattr(row, 'TypeName', op)))
                            owner = owners.get(id(row))
                            if not owner and hasattr(row, 'Class'):
                                owner = str(getattr(row.Class.row, 'TypeName', ''))
                            op = f'{owner + "." if owner else ""}{name}'
                print(ins.offset, ins.opcode.name, op)

if __name__ == '__main__': main()
