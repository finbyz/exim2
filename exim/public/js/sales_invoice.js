cur_frm.add_fetch("purchase_invoice", "range_and_division", "range_and_division");
cur_frm.add_fetch("purchase_invoice", "manufacturer", "manufacturer");
cur_frm.add_fetch('port_of_loading', 'country', 'country_of_origin');
cur_frm.add_fetch('port_of_discharge', 'country', 'country_of_destination');

this.frm.fields_dict.taxes_and_charges.get_query = function (doc) {
    return {
        "filters": {
            'company': doc.company
        }
    };
}
//filter manufacturer address in item
cur_frm.set_query('manufacturer_address', 'items', function (doc, cdt, cdn) {
    var d = locals[cdt][cdn];
    if (d.manufacturer == undefined) {
        frappe.msgprint("Please select the manufacturer");
    }
    else {
        return {
            query: "frappe.contacts.doctype.address.address.address_query",
            filters: { link_doctype: "Supplier", link_name: d.manufacturer }
        };
    }
});

frappe.ui.form.on("Sales Invoice", {
    before_save: function (frm) {
        frm.trigger("cal_igst_amount");
        frm.trigger("duty_drawback_cal");
        frm.trigger("calculate_total_fob_value");
        frm.trigger("cal_total_wt");
        frm.trigger("box_cal");
        frm.trigger("pallet_cal");
        frm.trigger("cal_total_container");
        frm.trigger("total_container_details");
        frm.trigger("set_maturity_date");
    },
    cal_igst_amount: function (frm) {
        let total_igst = 0.0;
        frm.doc.items.forEach(function (d) {
            if (d.igst_rate && d.fob_value) {
                frappe.model.set_value(d.doctype, d.name, 'igst_amount', (d.fob_value * parseInt(d.igst_rate)) / 100);
            } else {
                frappe.model.set_value(d.doctype, d.name, 'igst_amount', 0.0);
            }
            total_igst += flt(d.igst_amount);
        });
        frm.set_value('total_igst_amount', total_igst);
    },
    duty_drawback_cal: function (frm) {
        let total_dt = 0;
        frm.doc.items.forEach(function (d) {
            frappe.model.set_value(d.doctype, d.name, "duty_drawback_amount", flt(d.fob_value * d.duty_drawback_rate / 100));
            total_dt += flt(d.duty_drawback_amount);
        });
        frm.set_value("total_duty_drawback", total_dt);
    },
    calculate_total_fob_value: function (frm) {
        let total_fob_value = 0;
        frm.doc.items.forEach(function (d) {
            total_fob_value += flt(d.fob_value);
        });
        frm.set_value("total_fob_value", flt(total_fob_value));
    },
    cal_total_wt: function (frm) {
        let total_gross_wt = 0.0;
        let total_unit = 0;
        let freight = 0.0;
        let insurance = 0.0;
        let fob_value = 0.0;
        let duty_drawback_amount = 0.0;
        let meis_value = 0.0;
        let igst_amount = 0.0;

        frm.doc.items.forEach(function (d) {
            total_gross_wt += flt(d.gross_wt);
            if (d.palletd) {
                total_unit += flt(d.total_pallets);
            }
            else {
                total_unit += flt(d.no_of_packages);
            }
            freight += flt(d.freight);
            insurance += flt(d.insurance);
            frappe.model.set_value(d.doctype, d.name, "fob_value", flt(d.base_amount - (d.freight * frm.doc.conversion_rate) - (d.insurance * frm.doc.conversion_rate)));
            fob_value += flt(d.fob_value);
            duty_drawback_amount += flt(d.duty_drawback_amount);
            frappe.model.set_value(d.doctype, d.name, "meis_value", flt((d.fob_value * d.meis_rate) / 100.0));
            meis_value += flt(d.meis_value);
            igst_amount += flt(d.igst_amount);
        });
        frm.set_value("total_gr_wt", total_gross_wt);
        frm.set_value("total_unit", total_unit);
        frm.set_value("freight", freight);
        frm.set_value("insurance", insurance);
        frm.set_value("total_fob_value", fob_value);
        frm.set_value("total_duty_drawback", duty_drawback_amount);
        frm.set_value("total_meis", meis_value);
        frm.set_value("total_igst_amount", igst_amount);
    },
    box_cal: function (frm) {
        frm.doc.items.forEach(function (d, i) {
            if (i == 0) {
                d.packages_from = 1;
                d.packages_to = d.no_of_packages;
            }
            else {
                d.packages_from = Math.round(frm.doc.items[i - 1].packages_to + 1);
                d.packages_to = Math.round(d.packages_from + d.no_of_packages - 1);
            }
        });
        frm.refresh_field('items');
    },
    pallet_cal: function (frm) {
        frm.doc.items.forEach(function (d, i) {
            if (d.palleted) {
                if (i == 0) {
                    d.pallet_no_from = 1;
                    d.pallet_no_to = Math.round(d.total_pallets);
                }
                else {
                    d.pallet_no_from = Math.round(frm.doc.items[i - 1].pallet_no_to + 1);
                    d.pallet_no_to = Math.round(d.pallet_no_from + d.total_pallets - 1);
                }
            }
        });
        frm.refresh_field('items');
    },
    manufacturer_add: function (frm) {
        frm.doc.items.forEach(function (d) {
            frappe.call({
                method: "erpnext.accounts.party.get_party_details",
                args: {
                    party: d.manufacturer,
                    party_type: "Supplier"
                },
                callback: function (r) {
                    if (r.message) {
                        frappe.model.set_value(d.doctype, d.name, 'manufacturer_address', r.message.supplier_address);
                    }
                }
            });
        });
    },
    manufacturer_add_display: function (frm) {
        frm.doc.items.forEach(function (d) {
            if (d.manufacturer_address) {
                return frappe.call({
                    method: "frappe.contacts.doctype.address.address.get_address_display",
                    args: {
                        "address_dict": d.manufacturer_address
                    },
                    callback: function (r) {
                        if (r.message)
                            frappe.model.set_value(d.doctype, d.name, 'manufacturer_address_display', r.message);
                    }
                });
            }
        });
    },
    cal_total_container: function (frm) {
        if (frm.doc.container_detail != undefined) {
            let total_containers = 0;
            frm.doc.container_detail.forEach(function (d) {
                total_containers += 1;
            });
            frm.set_value('number_of_containers', total_containers);
        }
        else {
            frm.set_value('number_of_containers', 0);
        }
    },
    total_container_details: function (frm) {
        let total_packages = 0.0;
        let total_net_wt = 0.0;
        let total_gr_wt = 0.0;

        frm.doc.container_detail.forEach(function (d) {
            total_packages += flt(d.no_of_packages);
            total_net_wt += flt(d.nt_wt_kgs);
            total_gr_wt += flt(d.gr_wt_kgs);
            frappe.model.set_value(d.doctype, d.name, "nt_wt_kgs", (flt(d.net_wt_each_package) * flt(d.no_of_packages)));
            frappe.model.set_value(d.doctype, d.name, "gr_wt_kgs", (flt(d.gross_wt_each_package) * flt(d.no_of_packages)));
        });

        frm.set_value("total_packages", total_packages);
        frm.set_value("total_nt_wt_of_container", total_net_wt);
        frm.set_value("total_gr_wt_of_container", total_gr_wt);
    },
    contract_and_lc: function (frm) {
        if (frm.doc.contract_and_lc) {
            frappe.model.with_doc("Contract Term", frm.doc.contract_and_lc, function () {
                var doc = frappe.model.get_doc("Contract Term", frm.doc.contract_and_lc)

                frm.clear_table('sales_invoice_export_document_item')
                $.each(doc.document || [], function (i, d) {
                    let c = frm.add_child('sales_invoice_export_document_item')
                    c.contract_term = doc.name;
                    c.export_document = d.export_document
                    c.number = d.number
                    c.copy = d.copy
                })

                frm.clear_table('sales_invoice_contract_term_check')
                $.each(doc.contract_term_check || [], function (i, d) {
                    let c = frm.add_child('sales_invoice_contract_term_check')
                    c.contract_term = doc.name;
                    c.document_check = d.document_check
                })

                frm.refresh_field('sales_invoice_export_document_item')
                frm.refresh_field('sales_invoice_contract_term_check')
            });
        }
    },
    set_maturity_date: function (frm) {
        frappe.db.get_value("Contract Term", frm.doc.contract_and_lc, "payment_term", function (r) {
            frappe.db.get_value("Payment Term", r.payment_term, "credit_days", function (n) {
                frm.set_value("maturity_date", frappe.datetime.add_days(frm.doc.bl_date, n.credit_days));
            });
        });
    },
    calculate_taxes: function (frm) {
		let flag = 0;
        let diff = flt((frm.doc.base_total - frm.doc.total_fob_value) / frm.doc.total_fob_value) * 100;
        frm.doc.taxes.forEach(function (d) {
            if (d.account_head.includes("Freight and Forwarding")) {
                frappe.model.set_value(d.doctype, d.name, 'rate', diff);
                flag = 1;
            }
        })
        if (flag == 0) {
            frappe.db.get_value("Company", frm.doc.company, 'abbr', function (r) {
                let cost_center = frm.doc.cost_center || 'Main - ' + r.abbr;
                let m = frm.add_child("taxes");
                m.charge_type = 'On Net Total';
                m.account_head = 'Freight and Forwarding Charges - ' + r.abbr;
                m.description = 'Freight and Forwarding Charges';
                m.cost_center = cost_center;
                frappe.model.set_value(m.doctype, m.name, 'rate', diff);
                m.included_in_print_rate = 1;
            });
        }
    },
});

frappe.ui.form.on("Sales Invoice Item", {
    item_code: function (frm, cdt, cdn) {
        let d = locals[cdt][cdn];
        setTimeout(function () {
            frappe.db.get_value("Batch", d.batch_no, ['merge', 'grade'], function (r) {
                frappe.model.set_value(cdt, cdn, 'merge', r.merge);
                frappe.model.set_value(cdt, cdn, 'grade', r.grade);
            })
        }, 1000);
    },
    qty: function (frm, cdt, cdn) {
        // frm.events.cal_total(frm);
        let d = locals[cdt][cdn];
        frappe.model.set_value(cdt, cdn, "fob_value", flt(d.base_amount - (d.freight * frm.doc.conversion_rate) - (d.insurance * frm.doc.conversion_rate)));

        frappe.model.set_value(cdt, cdn, "total_pallets", Math.round(d.qty / d.pallet_size));
    },
    base_amount: function (frm, cdt, cdn) {
        let d = locals[cdt][cdn];
        frappe.model.set_value(cdt, cdn, "fob_value", flt(d.base_amount - (d.freight * frm.doc.conversion_rate) - (d.insurance * frm.doc.conversion_rate)));
    },
    freight: function (frm, cdt, cdn) {
        let d = locals[cdt][cdn];
        frappe.model.set_value(cdt, cdn, "fob_value", flt(d.base_amount - (d.freight * frm.doc.conversion_rate) - (d.insurance * frm.doc.conversion_rate)));
    },
    insurance: function (frm, cdt, cdn) {
        let d = locals[cdt][cdn];
        frappe.model.set_value(cdt, cdn, "fob_value", flt(d.base_amount - (d.freight * frm.doc.conversion_rate) - (d.insurance * frm.doc.conversion_rate)));
    },
    fob_value: function (frm, cdt, cdn) {
        let d = locals[cdt][cdn];
        frm.events.duty_drawback_cal(frm);
        frm.events.calculate_total_fob_value(frm);
        frm.events.cal_igst_amount(frm);
    },
    duty_drawback_rate: function (frm, cdt, cdn) {
        frm.events.duty_drawback_cal(frm);
    },
    capped_rate: function (frm, cdt, cdn) {
        let d = locals[cdt][cdn];
        frappe.model.set_value(cdt, cdn, "capped_amount", flt(d.qty * d.capped_rate));
    },
    capped_amount: function (frm, cdt, cdn) {
        let d = locals[cdt][cdn];
        if (d.maximum_cap == 1) {
            if (d.capped_amount < d.duty_drawback_amount) {
                frappe.model.set_value(cdt, cdn, "duty_drawback_amount", d.capped_amount);
            }
            if (d.fob_value) {
                frappe.model.set_value(cdt, cdn, "effective_rate", flt(d.capped_amount / d.fob_value * 100));
            }
        }
    },

    meis_rate: function (frm, cdt, cdn) {
        frm.events.cal_total_wt(frm);
    },
    igst_rate: function (frm, cdt, cdn) {
        frm.events.cal_igst_amount(frm);
    },

    gross_wt: function (frm, cdt, cdn) {
        frm.events.cal_total_wt(frm);
    },
    freight: function (frm, cdt, cdn) {
        frm.events.cal_total_wt(frm);
    },
    pallet_size: function (frm, cdt, cdn) {
        frappe.run_serially([
            () => {
                let d = locals[cdt][cdn];
                frappe.model.set_value(cdt, cdn, "total_pallets", Math.round(d.qty / d.pallet_size));
            },
            () => {
                frm.events.pallet_cal(frm);
            }
        ]);
    },
    no_of_packages: function (frm, cdt, cdn) {
        frm.events.box_cal(frm);
    },
    
});

frappe.ui.form.on("Container Detail", {
    // Calculate number of container on row addition
    container_detail_add: function (frm, cdt, cdn) {
        frm.events.cal_total_container(frm);
    },
    // Calculate number of container on row deletion
    container_detail_remove: function (frm, cdt, cdn) {
        frm.events.cal_total_container(frm);
    },
    no_of_packages: function (frm, cdt, cdn) {
        frm.events.total_container_details(frm);
    },
    nt_wt_kgs: function (frm, cdt, cdn) {
        frm.events.total_container_details(frm);
    },
    gr_wt_kgs: function (frm, cdt, cdn) {
        frm.events.total_container_details(frm);
    },
});