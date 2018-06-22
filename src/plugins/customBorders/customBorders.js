import BasePlugin from './../_base';
import { registerPlugin } from './../../plugins';
import {
  hasOwnProperty,
  objectEach,
  extend } from './../../helpers/object';
import { rangeEach } from './../../helpers/number';
import {
  arrayEach,
  arrayReduce,
  arrayMap } from './../../helpers/array';
import { CellRange } from './../../3rdparty/walkontable/src';
import * as C from './../../i18n/constants';
import {
  bottom,
  left,
  noBorders,
  right,
  top
} from './contextMenuItem';
import {
  createId,
  createDefaultCustomBorder,
  createSingleEmptyBorder,
  createEmptyBorders,
  extendDefaultBorder
} from './utils';

/**
 * @plugin CustomBorders
 *
 * @description
 * This plugin enables an option to apply custom borders through the context menu (configurable with context menu key `borders`).
 *
 * To initialize Handsontable with predefined custom borders, provide cell coordinates and border styles in a form of an array.
 *
 * See [Custom Borders](http://docs.handsontable.com/demo-custom-borders.html) demo for more examples.
 *
 * @example
 * ```js
 * ...
 * customBorders: [
 *   {
 *    range: {
 *      from: {
 *        row: 1,
 *        col: 1
 *      },
 *      to: {
 *        row: 3,
 *        col: 4
 *      },
 *    },
 *    left: {},
 *    right: {},
 *    top: {},
 *    bottom: {},
 *   },
 * ],
 * ...
 *
 * // or
 * ...
 * customBorders: [
 *   { row: 2,
 *     col: 2,
 *     left: {
 *       width: 2,
 *       color: 'red',
 *     },
 *     right: {
 *       width: 1,
 *       color: 'green',
 *     },
 *     top: '',
 *     bottom: '',
 *   }
 * ],
 * ...
 * ```
 * @private
 * @class CustomBorders
 */
class CustomBorders extends BasePlugin {
  constructor(hotInstance) {
    super(hotInstance);

    /**
     * Saved borders.
     *
     * @type {Array}
     */
    this.savedBorders = [];
  }

  /**
   * Check if the plugin is enabled in the handsontable settings.
   *
   * @returns {Boolean}
   */
  isEnabled() {
    return !!this.hot.getSettings().customBorders;
  }

  /**
   * Enable plugin for this Handsontable instance.
   */
  enablePlugin() {
    if (this.enabled) {
      return;
    }

    this.addHook('afterContextMenuDefaultOptions', (options) => this.onAfterContextMenuDefaultOptions(options));
    this.addHook('afterInit', () => this.onAfterInit());

    super.enablePlugin();
  }

  /**
   * Disable plugin for this Handsontable instance.
   */
  disablePlugin() {
    this.clearBorders();

    super.disablePlugin();
  }

  /**
   * Updates the plugin to use the latest options you have specified.
   */
  updatePlugin() {
    this.disablePlugin();
    this.enablePlugin();

    this.changeBorderSettings();

    super.updatePlugin();
  }

  /**
    * Set custom borders.
    *
    * @param {Array} selection
    * @param {Object} borderObject Object with `top`, `right`, `bottom` and `left` properties.
    */
  setBorders(selection, borderObject) {
    arrayEach(selection, (cell) => {
      if (!Array.isArray(cell)) {
        const topLeft = cell.getTopLeftCorner();
        const bottomRight = cell.getBottomRightCorner();

        rangeEach(topLeft.row, bottomRight.row, (row) => {
          rangeEach(topLeft.col, bottomRight.col, (column) => {
            this.removeAllBorders(row, column);
          });
        });

        this.prepareBorderFromCustomAddedRange(cell, borderObject);

      } else {
        const [startRow, startColumn, endRow, endColumn] = cell;

        if (startRow === endRow && startColumn === endColumn) {
          this.removeAllBorders(startRow, startColumn);
          this.prepareBorderFromCustomAdded(startRow, startColumn, borderObject);

        } else {
          const borderDescriptor = {};

          borderDescriptor.from = {row: startRow, col: startColumn};
          borderDescriptor.to = {row: endRow, col: endColumn};

          for (let row = startRow; row <= endRow; row += 1) {
            for (let col = startColumn; col <= endColumn; col += 1) {
              this.removeAllBorders(row, col);
            }
          }

          this.prepareBorderFromCustomAddedRange(borderDescriptor, borderObject);
        }
      }
    });
  }

  /**
    * Get custom borders.
    *
    * @param {Array} selection
    */
  getBorders(selection) {
    let selectedBorders = [];

    arrayEach(selection, (cell) => {
      if (!Array.isArray(cell)) {
        const topLeft = cell.getTopLeftCorner();
        const bottomRight = cell.getBottomRightCorner();

        rangeEach(topLeft.row, bottomRight.row, (row) => {
          rangeEach(topLeft.col, bottomRight.col, (column) => {
            arrayEach(this.savedBorders, (border) => {
              if (border.row === row && border.col === column) {
                selectedBorders.push(border);
              }
            });
          });
        });

      } else {
        const [startRow, startColumn, endRow, endColumn] = cell;

        if (startRow === endRow && startColumn === endColumn) {
          arrayEach(this.savedBorders, (border) => {
            if (border.row === startRow && border.col === startColumn) {
              selectedBorders.push(border);
            }
          });

        } else {
          for (let row = startRow; row <= endRow; row += 1) {
            for (let col = startColumn; col <= endColumn; col += 1) {
              arrayEach(this.savedBorders, (border) => {
                if (border.row === row && border.col === col) {
                  selectedBorders.push(border);
                }
              });
            }
          }
        }
      }
    });

    return selectedBorders;
  }

  /**
    * Clear custom borders.
    *
    * @param {Array} selection
    */
  clearBorders(selection) {
    if (!selection) {
      arrayEach(this.savedBorders, (border) => {
        this.clearBordersFromSelectionSettings(border.id);
        this.hot.removeCellMeta(border.row, border.col, 'borders');
      });

    } else {
      this.setBorders(selection);
    }
  }

  /**
   * Insert WalkontableSelection instance into Walkontable settings.
   *
   * @private
   * @param {Object} border Object with `row` and `col`, `left`, `right`, `top` and `bottom`, `id` and `border` ({Object} with `color`, `width` and `cornerVisible` property) properties.
   */
  insertBorderIntoSettings(border) {
    const hasSavedBorders = this.checkSavedBorders(border);

    if (!hasSavedBorders) {
      this.savedBorders.push(border);
    }

    const coordinates = {
      row: border.row,
      col: border.col
    };
    const cellRange = new CellRange(coordinates, coordinates, coordinates);
    const hasCustomSelections = this.checkCustomSelections(border, cellRange);

    if (!hasCustomSelections) {
      this.hot.selection.highlight.addCustomSelection({border, cellRange});
      this.hot.view.wt.draw(true);
    }
  }

  /**
   * Prepare borders from setting (single cell).
   *
   * @private
   * @param {Number} row Visual row index.
   * @param {Number} column Visual column index.
   * @param {Object} borderDescriptor Object with `row` and `col`, `left`, `right`, `top` and `bottom` properties.
   */
  prepareBorderFromCustomAdded(row, column, borderDescriptor) {
    let border = createEmptyBorders(row, column);
    border = extendDefaultBorder(border, borderDescriptor);

    this.hot.setCellMeta(row, column, 'borders', border);

    this.insertBorderIntoSettings(border);
  }

  /**
   * Prepare borders from setting (object).
   *
   * @private
   * @param {Object} rowDecriptor Object with `range`, `left`, `right`, `top` and `bottom` properties.
   * @param {Object} borderObject Object with `left`, `right`, `top` and `bottom` properties.
   */
  prepareBorderFromCustomAddedRange(rowDecriptor, borderObject) {
    const range = rowDecriptor.range || rowDecriptor;
    const borderDescriptor = borderObject || rowDecriptor;

    rangeEach(range.from.row, range.to.row, (rowIndex) => {
      rangeEach(range.from.col, range.to.col, (colIndex) => {
        let border = createEmptyBorders(rowIndex, colIndex);
        let add = 0;

        if (rowIndex === range.from.row) {
          add += 1;

          if (hasOwnProperty(borderDescriptor, 'top')) {
            border.top = borderDescriptor.top;
            this.hot.setCellMeta(rowIndex, colIndex, 'borders', border);
          }
        }

        if (rowIndex === range.to.row) {
          add += 1;

          if (hasOwnProperty(borderDescriptor, 'bottom')) {
            border.bottom = borderDescriptor.bottom;
            this.hot.setCellMeta(rowIndex, colIndex, 'borders', border);
          }
        }

        if (colIndex === range.from.col) {
          add += 1;

          if (hasOwnProperty(borderDescriptor, 'left')) {
            border.left = borderDescriptor.left;
            this.hot.setCellMeta(rowIndex, colIndex, 'borders', border);
          }
        }

        if (colIndex === range.to.col) {
          add += 1;

          if (hasOwnProperty(borderDescriptor, 'right')) {
            border.right = borderDescriptor.right;
            this.hot.setCellMeta(rowIndex, colIndex, 'borders', border);
          }
        }

        if (add > 0) {
          this.insertBorderIntoSettings(border);
        }
      });
    });
  }

  /**
   * Remove border (triggered from context menu).
   *
   * @private
   * @param {Number} row Visual row index.
   * @param {Number} column Visual column index.
   */
  removeAllBorders(row, column) {
    const borderId = createId(row, column);

    this.spliceBorder(borderId);

    this.clearBordersFromSelectionSettings(borderId);
    this.clearNullCellRange();

    this.hot.removeCellMeta(row, column, 'borders');
  }

  /**
   * Set borders for each cell re. to border position.
   *
   * @private
   * @param {Number} row Visual row index.
   * @param {Number} column Visual column index.
   * @param {String} place Coordinate where add/remove border - `top`, `bottom`, `left`, `right` and `noBorders`.
   * @param {Boolean} remove True when remove borders, and false when add borders.
   */
  setBorder(row, column, place, remove) {
    let bordersMeta = this.hot.getCellMeta(row, column).borders;

    if (!bordersMeta || bordersMeta.border === void 0) {
      bordersMeta = createEmptyBorders(row, column);
    }

    if (remove) {
      bordersMeta[place] = createSingleEmptyBorder();

      const hideCount = this.countHide(bordersMeta);

      if (hideCount === 4) {
        this.removeAllBorders(row, column);

      } else {
        const customSelectionsChecker = this.checkCustomSelectionsFromContextMenu(bordersMeta, place, remove);

        if (!customSelectionsChecker) {
          this.insertBorderIntoSettings(bordersMeta);
        }

        this.hot.setCellMeta(row, column, 'borders', bordersMeta);
      }

    } else {
      bordersMeta[place] = createDefaultCustomBorder();

      const customSelectionsChecker = this.checkCustomSelectionsFromContextMenu(bordersMeta, place, remove);

      if (!customSelectionsChecker) {
        this.insertBorderIntoSettings(bordersMeta);
      }

      this.hot.setCellMeta(row, column, 'borders', bordersMeta);
    }
  }

  /**
   * Prepare borders based on cell and border position.
   *
   * @private
   * @param {Object} selected
   * @param {String} place Coordinate where add/remove border - `top`, `bottom`, `left`, `right` and `noBorders`.
   * @param {Boolean} remove True when remove borders, and false when add borders.
   */
  prepareBorder(selected, place, remove) {
    arrayEach(selected, ({start, end}) => {
      if (start.row === end.row && start.col === end.col) {
        if (place === 'noBorders') {
          this.removeAllBorders(start.row, start.col);
        } else {
          this.setBorder(start.row, start.col, place, remove);
        }

      } else {
        switch (place) {
          case 'noBorders':
            rangeEach(start.col, end.col, (colIndex) => {
              rangeEach(start.row, end.row, (rowIndex) => {
                this.removeAllBorders(rowIndex, colIndex);
              });
            });
            break;

          case 'top':
            rangeEach(start.col, end.col, (topCol) => {
              this.setBorder(start.row, topCol, place, remove);
            });
            break;

          case 'right':
            rangeEach(start.row, end.row, (rowRight) => {
              this.setBorder(rowRight, end.col, place, remove);
            });
            break;

          case 'bottom':
            rangeEach(start.col, end.col, (bottomCol) => {
              this.setBorder(end.row, bottomCol, place, remove);
            });
            break;

          case 'left':
            rangeEach(start.row, end.row, (rowLeft) => {
              this.setBorder(rowLeft, start.col, place, remove);
            });
            break;
          default:
            break;
        }
      }
    });
  }

  /**
   * Create borders from settings.
   *
   * @private
   * @param {Array} customBorders Object with `row` and `col`, `left`, `right`, `top` and `bottom` properties.
   */
  createCustomBorders(customBorders) {
    arrayEach(customBorders, (customBorder) => {
      if (customBorder.range) {
        this.prepareBorderFromCustomAddedRange(customBorder);

      } else {
        this.prepareBorderFromCustomAdded(customBorder.row, customBorder.col, customBorder);
      }
    });
  }

  /**
  * Count hide property in border object.
  *
  * @private
  * @param {Object} border Object with `row` and `col`, `left`, `right`, `top` and `bottom`, `id` and `border` ({Object} with `color`, `width` and `cornerVisible` property) properties.
  */
  countHide(border) {
    const values = Object.values(border);

    return arrayReduce(values, (accumulator, value) => {
      if (value.hide) {
        accumulator += 1;
      }

      return accumulator;
    }, 0);
  }

  /**
  * Clear borders settings from custom selections.
  *
  * @private
  * @param {String} borderId Border id name as string.
  */
  clearBordersFromSelectionSettings(borderId) {
    const index = arrayMap(this.hot.selection.highlight.customSelections, (customSelection) => customSelection.settings.id).indexOf(borderId);

    if (index > -1) {
      this.hot.selection.highlight.customSelections[index].clear();
    }

    this.hot.view.wt.draw(true);
  }

  /**
  * Clear cellRange with null value.
  *
  * @private
  */
  clearNullCellRange() {
    arrayEach(this.hot.selection.highlight.customSelections, (customSelection, index) => {
      if (customSelection.cellRange === null) {
        this.hot.selection.highlight.customSelections.splice(index, 1);

        return false; // breaks forAll
      }
    });
  }

  /**
  * Splice border from savedBorders.
  *
  * @private
  * @param {String} borderId Border id name as string.
  */
  spliceBorder(borderId) {
    const index = arrayMap(this.savedBorders, (border) => border.id).indexOf(borderId);

    if (index > -1) {
      this.savedBorders.splice(index, 1);
    }
  }

  /**
  * Check if an border already exists in the savedBorders array, and if true update border in savedBorders.
  *
  * @private
  * @param {Object} border Object with `row` and `col`, `left`, `right`, `top` and `bottom`, `id` and `border` ({Object} with `color`, `width` and `cornerVisible` property) properties.
  *
  * @return {Boolean}
  */
  checkSavedBorders(border) {
    let check = false;

    const hideCount = this.countHide(border);

    if (hideCount === 4) {
      this.spliceBorder(border.id);
      check = true;

    } else {
      arrayEach(this.savedBorders, (savedBorder, index) => {
        if (border.id === savedBorder.id) {
          this.savedBorders[index] = border;
          check = true;

          return false; // breaks forAll
        }
      });
    }

    return check;
  }

  /**
  * Check if an border already exists in the customSelections, and if true call toggleHiddenClass method.
  *
  * @private
  * @param {Object} border Object with `row` and `col`, `left`, `right`, `top` and `bottom`, `id` and `border` ({Object} with `color`, `width` and `cornerVisible` property) properties.
  * @param {String} place Coordinate where add/remove border - `top`, `bottom`, `left`, `right` and `noBorders`.
  *
  * @return {Boolean}
  */
  checkCustomSelectionsFromContextMenu(border, place, remove) {
    let check = false;

    arrayEach(this.hot.selection.highlight.customSelections, (customSelection) => {
      if (border.id === customSelection.settings.id) {
        objectEach(customSelection.instanceBorders, (borderObject) => {
          borderObject.toggleHiddenClass(place, remove);
        });

        check = true;

        return false; // breaks forAll
      }
    });

    return check;
  }

  /**
  * Check if an border already exists in the customSelections, and if true reset cellRange.
  *
  * @private
  * @param {Object} border Object with `row` and `col`, `left`, `right`, `top` and `bottom`, `id` and `border` ({Object} with `color`, `width` and `cornerVisible` property) properties.
  * @param {CellRange} cellRange
  *
  * @return {Boolean}
  */
  checkCustomSelections(border, cellRange) {
    let check = false;

    arrayEach(this.hot.selection.highlight.customSelections, (customSelection) => {
      if (border.id === customSelection.settings.id) {
        extend(customSelection.settings, border);
        customSelection.cellRange = cellRange;

        check = true;

        return false; // breaks forAll
      }
    });

    return check;
  }

  /**
   * Change borders from settings.
   *
   * @private
   */
  changeBorderSettings() {
    const customBorders = this.hot.getSettings().customBorders;

    if (Array.isArray(customBorders)) {
      if (!customBorders.length) {
        this.savedBorders = customBorders;
      }

      this.createCustomBorders(customBorders);

    } else if (customBorders !== void 0) {
      this.createCustomBorders(this.savedBorders);
    }
  }

  /**
  * Add border options to context menu.
  *
  * @private
  * @param {Object} defaultOptions Context menu items.
  */
  onAfterContextMenuDefaultOptions(defaultOptions) {
    if (!this.hot.getSettings().customBorders) {
      return;
    }

    defaultOptions.items.push({
      name: '---------',
    }, {
      key: 'borders',
      name() {
        return this.getTranslatedPhrase(C.CONTEXTMENU_ITEMS_BORDERS);
      },
      disabled() {
        return this.selection.isSelectedByCorner();
      },
      submenu: {
        items: [
          top(this),
          right(this),
          bottom(this),
          left(this),
          noBorders(this)
        ]
      }
    });
  }

  /**
   * `afterInit` hook callback.
   *
   * @private
   */
  onAfterInit() {
    this.changeBorderSettings();
  }

  /**
   * Destroy plugin instance.
   */
  destroy() {
    super.destroy();
  }
}

registerPlugin('customBorders', CustomBorders);

export default CustomBorders;
